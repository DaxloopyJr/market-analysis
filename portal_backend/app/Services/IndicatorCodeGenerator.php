<?php

namespace App\Services;

use App\Models\Indicator;
use App\Models\Institution;
use Illuminate\Support\Facades\DB;
use LogicException;

class IndicatorCodeGenerator
{
    public function next(?int $institutionId): string
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('Indicator code lazima izalishwe ndani ya transaction.');
        }
        // Catalogue inayoundwa bila taasisi hutumia prefix PORTAL.
        $institutionCode = $institutionId === null ? 'PORTAL' : Institution::findOrFail($institutionId)->code;
        $prefix = $institutionCode.'/IND/'.now()->format('Y').'/';
        DB::table('indicator_code_counters')->insertOrIgnore(['prefix' => $prefix, 'last_number' => 0]);
        $query = DB::table('indicator_code_counters')->where('prefix', $prefix);
        $counter = (clone $query)->lockForUpdate()->first();
        $number = (int) $counter->last_number;
        if ($number === 0) {
            // Codes zilizoundwa zamani hubaki; sequence huanzia baada ya suffix kubwa iliyopo.
            foreach (Indicator::pluck('indicator_code') as $code) {
                if (str_starts_with($code, $prefix)) {
                    $suffix = substr($code, strlen($prefix));
                    if ($suffix !== '' && ctype_digit($suffix)) {
                        $number = max($number, (int) $suffix);
                    }
                }
            }
        }
        do {
            $number++;
            $code = $prefix.str_pad((string) $number, 4, '0', STR_PAD_LEFT);
        } while (Indicator::where('indicator_code', $code)->exists());
        $query->update(['last_number' => $number]);

        return $code;
    }
}
