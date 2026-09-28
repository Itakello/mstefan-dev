import * as migration_20260917_195926_initial from './20260917_195926_initial';
import * as migration_20260928_212105_career from './20260928_212105_career';

export const migrations = [
  {
    up: migration_20260917_195926_initial.up,
    down: migration_20260917_195926_initial.down,
    name: '20260917_195926_initial',
  },
  {
    up: migration_20260928_212105_career.up,
    down: migration_20260928_212105_career.down,
    name: '20260928_212105_career'
  },
];
