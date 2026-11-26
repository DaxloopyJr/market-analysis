<?php

namespace App\Services;

use Brick\Math\BigDecimal;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class SubmissionValueValidator
{
    public function validate(array $snapshot, array $rows, bool $complete): array
    {
        $indicators = collect($snapshot['indicators'] ?? [])->keyBy('id');
        $result = [];
        $seen = [];
        $filled = [];
        $modes = [];
        foreach ($rows as $index => $row) {
            $field = "values.$index";
            $indicator = $indicators->get($row['indicatorId']);
            $this->check($indicator !== null, $field.'.indicatorId', 'Indicator is not in this template version.');
            $id = (int) $row['indicatorId'];
            $summary = array_key_exists('breakdowns', $row);
            $this->check(! isset($modes[$id]) || $modes[$id] === $summary, $field, 'Do not mix an indicator total with dimensional rows for the same indicator.');
            $modes[$id] = $summary;
            if ($summary) {
                $this->check(empty($row['dimensionValues']), $field.'.dimensionValues', 'A total with breakdowns cannot also have dimensionValues.');
                $this->check(in_array($indicator['data_type'], ['integer', 'decimal'], true), $field.'.breakdowns', 'Breakdown totals require a numeric indicator.');
            }
            $dimensions = collect($snapshot['dimensions'] ?? [])->filter(fn ($d) => empty($d['indicatorIds']) || in_array($id, $d['indicatorIds'], true))->keyBy('id');
            $values = [];
            foreach ($row['dimensionValues'] ?? [] as $n => $entry) {
                $key = (int) $entry['dimensionId'];
                $definition = $dimensions->get($key);
                $this->check($definition !== null && ! isset($values[$key]), "$field.dimensionValues.$n", 'Dimension is invalid or duplicated.');
                $value = $entry['value'];
                if ($definition['data_type'] === 'reference') {
                    $options = ($definition['optionSource'] ?? null) === 'manual' ? ($definition['options'] ?? []) : ($definition['referenceValues'] ?? []);
                    $this->check((is_int($value) || (is_string($value) && ctype_digit($value))) && collect($options)->contains(fn ($o) => (string) $o['id'] === (string) (int) $value), "$field.dimensionValues.$n.value", 'Option is not in the template snapshot.');
                    $value = (int) $value;
                } else {
                    $value = $this->typed($value, $definition['data_type'], "$field.dimensionValues.$n.value", 255);
                }
                $this->check($value !== null, "$field.dimensionValues.$n.value", 'Dimension value cannot be null.');
                $values[$key] = ['dimensionId' => $key, 'value' => $value];
            }
            if ($complete && ! $summary) {
                foreach ($dimensions as $key => $d) {
                    $this->check(! ($d['isRequired'] ?? false) || isset($values[$key]), $field.'.dimensionValues', 'Required dimension is missing.');
                }
            }
            ksort($values);
            $values = array_values($values);
            $hash = hash('sha256', json_encode($values, JSON_THROW_ON_ERROR));
            $identity = $id.':'.$hash;
            $this->check(! isset($seen[$identity]), $field, 'Indicator/dimension combination is duplicated.');
            $seen[$identity] = true;
            $value = $this->typed($row['value'] ?? null, $indicator['data_type'], $field.'.value');
            if ($complete) {
                $this->check($value !== null, $field.'.value', 'Complete this row or remove it before submitting.');
            }
            if ($value !== null) {
                $filled[$id] = true;
            }
            $breakdowns = $summary ? $this->breakdowns($dimensions->all(), $row['breakdowns'], $indicator['data_type'], $value, $complete, $field.'.breakdowns') : null;
            $column = match ($indicator['data_type']) {
                'integer','decimal' => 'value_numeric','boolean' => 'value_boolean','date' => 'value_date',default => 'value_text'
            };
            $result[] = ['indicator_id' => $id, 'dimension_values' => $values, 'dimension_key' => $hash, 'data_type' => $indicator['data_type'],
                'value_numeric' => null, 'value_text' => null, 'value_boolean' => null, 'value_date' => null, $column => $value,
                'breakdowns' => $breakdowns, 'remarks' => isset($row['remarks']) ? trim($row['remarks']) : null];
        }
        if ($complete) {
            $this->check($rows !== [], 'values', 'At least one value is required.');
            foreach ($indicators as $id => $indicator) {
                $this->check(! ($indicator['isRequired'] ?? false) || isset($filled[$id]), 'values', 'Required indicator '.$id.' is missing.');
            }
        }

        return $result;
    }

    private function breakdowns(array $dimensions, array $entries, string $type, ?string $total, bool $complete, string $field): array
    {
        $groups = [];
        $result = [];
        foreach ($entries as $index => $entry) {
            $dimensionId = (int) $entry['dimensionId'];
            $optionId = (int) $entry['optionId'];
            $dimension = $dimensions[$dimensionId] ?? null;
            $this->check($dimension !== null && $dimension['data_type'] === 'reference', "$field.$index.dimensionId", 'Choose a reference dimension linked to this indicator in the template.');
            $options = ($dimension['optionSource'] ?? null) === 'manual' ? ($dimension['options'] ?? []) : ($dimension['referenceValues'] ?? []);
            $this->check(collect($options)->contains(fn ($option) => (int) $option['id'] === $optionId), "$field.$index.optionId", 'Option is not in the template snapshot.');
            $this->check(! array_key_exists($optionId, $groups[$dimensionId] ?? []), "$field.$index.optionId", 'Dimension option is duplicated.');
            $value = $this->typed($entry['value'], $type, "$field.$index.value");
            $groups[$dimensionId][$optionId] = $value;
            $result[] = ['dimensionId' => $dimensionId, 'optionId' => $optionId, 'value' => $value];
        }
        if ($complete) {
            foreach ($dimensions as $dimensionId => $dimension) {
                $group = $groups[$dimensionId] ?? [];
                $this->check(! ($dimension['isRequired'] ?? false) || $group !== [], $field, 'Required dimension '.$dimensionId.' is missing.');
                if ($group === []) {
                    continue;
                }
                $options = ($dimension['optionSource'] ?? null) === 'manual' ? ($dimension['options'] ?? []) : ($dimension['referenceValues'] ?? []);
                $this->check(count($group) === count($options) && ! in_array(null, $group, true), $field, 'Complete every option for dimension '.$dimensionId.'; use zero where applicable.');
                $sum = BigDecimal::of('0');
                foreach ($group as $value) {
                    $sum = $sum->plus($value);
                }
                $this->check($total !== null && $sum->isEqualTo($total), $field, 'Values for dimension '.$dimensionId.' must add up to the indicator total.');
            }
        }
        usort($result, fn ($a, $b) => [$a['dimensionId'], $a['optionId']] <=> [$b['dimensionId'], $b['optionId']]);

        return $result;
    }

    private function typed(mixed $value, string $type, string $field, int $max = 10000): mixed
    {
        if ($value === null) {
            return null;
        }
        if (in_array($type, ['integer', 'decimal'], true)) {
            $pattern = $type === 'integer' ? '/^-?\d{1,18}$/' : '/^-?\d{1,18}(\.\d{1,6})?$/';
            $this->check((is_int($value) || is_string($value)) && preg_match($pattern, (string) $value), $field, 'Use a numeric string: max 18 integer digits and 6 decimal places.');
            $negative = str_starts_with((string) $value, '-');
            [$whole,$fraction] = array_pad(explode('.', ltrim((string) $value, '-')), 2, '');
            $whole = ltrim($whole, '0') ?: '0';
            $fraction = rtrim($fraction, '0');
            $normal = $whole.($fraction !== '' ? '.'.$fraction : '');

            return ($negative && $normal !== '0' ? '-' : '').$normal;
        }
        if ($type === 'boolean') {
            $this->check(is_bool($value), $field, 'Use true or false.');

            return $value;
        }
        $validation = Validator::make(['value' => $value], ['value' => $type === 'date' ? ['required', 'string', 'date_format:Y-m-d'] : ['required', 'string', 'max:'.$max]]);
        if ($validation->fails()) {
            throw ValidationException::withMessages([$field => $validation->errors()->first('value')]);
        }

        return $type === 'date' ? $value : trim($value);
    }

    private function check(bool $valid, string $field, string $message): void
    {
        if (! $valid) {
            throw ValidationException::withMessages([$field => $message]);
        }
    }
}
