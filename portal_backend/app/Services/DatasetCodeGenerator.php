<?php

namespace App\Services;

use App\Models\DatasetDefinition;
use App\Models\Institution;
use Illuminate\Support\Facades\DB;
use LogicException;

class DatasetCodeGenerator
{
    public function next(int $institutionId): string
    {
        // Lock lazima idumu mpaka dataset, frequencies na audit vihifadhiwe pamoja.
        if (DB::transactionLevel() === 0) {
            throw new LogicException('Dataset code lazima itengenezwe ndani ya transaction.');
        }

        // Institution lock inalinda hata request ya kwanza kabla counter row haijaundwa.
        $institution = Institution::whereKey($institutionId)->lockForUpdate()->firstOrFail();
        $year = (int) now()->format('Y');
        $prefix = $institution->code.'/'.$year.'/';
        $query = DB::table('dataset_code_counters')->where('institution_id', $institutionId)->where('year', $year);
        $counter = (clone $query)->lockForUpdate()->first();
        $lastNumber = (int) ($counter->last_number ?? 0);

        if ($counter === null) {
            // Codes za zamani hazibadilishwi; sequence huanzia baada ya suffix kubwa iliyopo.
            foreach (DatasetDefinition::where('institution_id', $institutionId)->pluck('dataset_code') as $code) {
                if (str_starts_with($code, $prefix)) {
                    $suffix = substr($code, strlen($prefix));
                    if ($suffix !== '' && ctype_digit($suffix)) {
                        $lastNumber = max($lastNumber, (int) $suffix);
                    }
                }
            }
            DB::table('dataset_code_counters')->insert([
                'institution_id' => $institutionId, 'year' => $year, 'last_number' => $lastNumber,
            ]);
        }

        do {
            $lastNumber++;
            $code = $prefix.str_pad((string) $lastNumber, 4, '0', STR_PAD_LEFT);
        } while (DatasetDefinition::where('institution_id', $institutionId)->where('dataset_code', $code)->exists());

        $query->update(['last_number' => $lastNumber]);

        return $code;
    }
}
