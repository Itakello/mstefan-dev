import * as migration_20260917_195926_initial from './20260917_195926_initial';

export const migrations = [
  {
    up: migration_20260917_195926_initial.up,
    down: migration_20260917_195926_initial.down,
    name: '20260917_195926_initial'
  },
];
