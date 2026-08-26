<?php

namespace Database\Seeders;

use App\Models\JobExperienceLevel;
use App\Models\JobQualification;
use Illuminate\Database\Seeder;

/**
 * The two lists a vacancy form picks from.
 *
 * Reference data, not demo content: these are the qualifications and experience
 * bands a hardware and network firm in India actually recruits against, and the
 * client edits them rather than deletes them. No vacancies are seeded — a
 * careers page advertising an invented job is worse than an empty one, because
 * somebody will apply to it.
 */
class CareersSeeder extends Seeder
{
    public function run(): void
    {
        $levels = [
            ['Fresher', 0, 1],
            ['1-3 years', 1, 3],
            ['3-5 years', 3, 5],
            ['5-8 years', 5, 8],
            ['8+ years', 8, null],
        ];

        foreach ($levels as $i => [$name, $min, $max]) {
            JobExperienceLevel::updateOrCreate(
                ['name' => $name],
                ['min_years' => $min, 'max_years' => $max, 'sort_order' => $i],
            );
        }

        $qualifications = [
            'B.E. / B.Tech', 'Diploma in Engineering', 'B.Sc. Computer Science',
            'MCA', 'M.E. / M.Tech', 'ITI Certificate', 'CCNA', 'MBA',
        ];

        foreach ($qualifications as $i => $name) {
            JobQualification::updateOrCreate(['name' => $name], ['sort_order' => $i]);
        }
    }
}
