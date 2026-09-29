import * as migration_20260917_195926_initial from './20260917_195926_initial';
import * as migration_20260928_212105_career from './20260928_212105_career';
import * as migration_20260929_081759_career_branch_graph from './20260929_081759_career_branch_graph';
import * as migration_20260929_160549_career_ongoing from './20260929_160549_career_ongoing';
import * as migration_20260929_205504_career_photo from './20260929_205504_career_photo';
import * as migration_20260929_220029_career_documents from './20260929_220029_career_documents';

export const migrations = [
  {
    up: migration_20260917_195926_initial.up,
    down: migration_20260917_195926_initial.down,
    name: '20260917_195926_initial',
  },
  {
    up: migration_20260928_212105_career.up,
    down: migration_20260928_212105_career.down,
    name: '20260928_212105_career',
  },
  {
    up: migration_20260929_081759_career_branch_graph.up,
    down: migration_20260929_081759_career_branch_graph.down,
    name: '20260929_081759_career_branch_graph',
  },
  {
    up: migration_20260929_160549_career_ongoing.up,
    down: migration_20260929_160549_career_ongoing.down,
    name: '20260929_160549_career_ongoing',
  },
  {
    up: migration_20260929_205504_career_photo.up,
    down: migration_20260929_205504_career_photo.down,
    name: '20260929_205504_career_photo',
  },
  {
    up: migration_20260929_220029_career_documents.up,
    down: migration_20260929_220029_career_documents.down,
    name: '20260929_220029_career_documents',
  },
];
