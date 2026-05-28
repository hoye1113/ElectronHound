import type Database from 'better-sqlite3';

interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  goal: string;
  config: Record<string, unknown>;
  variables: string[];
}

const builtInTemplates: BuiltInTemplate[] = [
  {
    id: 'builtin-login-flow',
    name: 'Login Flow',
    description: 'Test login form with valid and invalid credentials',
    category: 'login',
    goal: 'Test login form with valid and invalid credentials',
    config: {
      steps: [
        'Navigate to login page',
        'Enter invalid credentials and verify error message',
        'Enter valid credentials and verify successful login',
      ],
    },
    variables: ['formSelector', 'submitButton', 'validUser', 'validPass'],
  },
  {
    id: 'builtin-crud-operations',
    name: 'CRUD Operations',
    description: 'Test create, read, update, delete operations',
    category: 'crud',
    goal: 'Test create, read, update, delete operations',
    config: {
      steps: [
        'Create a new item',
        'Verify item appears in list',
        'Edit the item',
        'Verify changes are saved',
        'Delete the item',
        'Verify item is removed',
      ],
    },
    variables: ['listSelector', 'createButton', 'editButton', 'deleteButton'],
  },
  {
    id: 'builtin-form-validation',
    name: 'Form Validation',
    description: 'Verify form validation messages appear',
    category: 'form',
    goal: 'Verify form validation messages appear',
    config: {
      steps: [
        'Submit form with empty required fields',
        'Verify validation errors appear',
        'Enter invalid data and verify format errors',
        'Enter valid data and verify submission succeeds',
      ],
    },
    variables: ['formSelector', 'invalidInput', 'errorMessage'],
  },
  {
    id: 'builtin-navigation-test',
    name: 'Navigation Test',
    description: 'Test all menu items and routes',
    category: 'navigation',
    goal: 'Test all menu items and routes',
    config: {
      steps: [
        'Click each menu item',
        'Verify correct page loads',
        'Test back navigation',
        'Verify URL changes match expected routes',
      ],
    },
    variables: ['menuSelector', 'expectedRoutes'],
  },
  {
    id: 'builtin-file-dialog',
    name: 'File Dialog',
    description: 'Test file open/save dialogs',
    category: 'file',
    goal: 'Test file open/save dialogs',
    config: {
      steps: [
        'Trigger file dialog',
        'Select a file',
        'Verify file is loaded/saved correctly',
      ],
    },
    variables: ['action', 'expectedDialog'],
  },
  {
    id: 'builtin-settings-page',
    name: 'Settings Page',
    description: 'Test settings form persistence',
    category: 'settings',
    goal: 'Test settings form persistence',
    config: {
      steps: [
        'Navigate to settings',
        'Change settings values',
        'Save settings',
        'Reload application',
        'Verify settings are persisted',
      ],
    },
    variables: ['settingsSelector', 'testValues'],
  },
];

export function seedBuiltInTemplates(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
    VALUES (@id, @name, @description, @category, @goal, @config, @variables, 1, datetime('now'), datetime('now'))
  `);

  const insertMany = db.transaction((templates: BuiltInTemplate[]) => {
    for (const template of templates) {
      insert.run({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        goal: template.goal,
        config: JSON.stringify(template.config),
        variables: JSON.stringify(template.variables),
      });
    }
  });

  insertMany(builtInTemplates);
}
