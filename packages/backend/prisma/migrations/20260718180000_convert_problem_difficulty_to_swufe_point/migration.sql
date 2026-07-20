UPDATE "Problem" SET "difficulty" = 'POINT_0'
WHERE "difficulty" IN ('BEGINNER', 'EASY', '800', '1000');

UPDATE "Problem" SET "difficulty" = 'POINT_1'
WHERE "difficulty" IN ('POPULAR-', 'POPULAR', 'INTERMEDIATE', '1200', '1400', 'UNRATED');

UPDATE "Problem" SET "difficulty" = 'POINT_2'
WHERE "difficulty" IN ('IMPROVE-', 'IMPROVE', '1600');

UPDATE "Problem" SET "difficulty" = 'POINT_3'
WHERE "difficulty" IN ('PROVINCIAL', '2200');

UPDATE "Problem" SET "difficulty" = 'POINT_4'
WHERE "difficulty" IN ('NOI', '2600');

UPDATE "Problem" SET "difficulty" = 'POINT_5'
WHERE "difficulty" IN ('IOI+', '3000');
