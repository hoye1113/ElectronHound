import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CLIHelp,
  createCLIHelp,
  COMMANDS,
  resolveCommandAlias,
} from '../cli-help.js';

describe('CLI Help', () => {
  let mockConsole: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockConsole = { log: vi.fn() };
    vi.spyOn(console, 'log').mockImplementation(mockConsole.log);
  });

  describe('COMMANDS', () => {
    it('should have all required commands', () => {
      const commandNames = COMMANDS.map((cmd) => cmd.name);
      expect(commandNames).toContain('run');
      expect(commandNames).toContain('config');
      expect(commandNames).toContain('provider');
      expect(commandNames).toContain('report');
      expect(commandNames).toContain('server');
      expect(commandNames).toContain('help');
      expect(commandNames).toContain('version');
    });

    it('should have valid command structure', () => {
      for (const cmd of COMMANDS) {
        expect(cmd.name).toBeDefined();
        expect(cmd.aliases).toBeInstanceOf(Array);
        expect(cmd.description).toBeDefined();
        expect(cmd.usage).toBeDefined();
        expect(cmd.options).toBeInstanceOf(Array);
        expect(cmd.examples).toBeInstanceOf(Array);
        expect(cmd.category).toBeDefined();
      }
    });
  });

  describe('CLIHelp', () => {
    it('should create CLIHelp with default options', () => {
      const help = new CLIHelp();
      expect(help).toBeDefined();
    });

    it('should create CLIHelp with custom options', () => {
      const help = new CLIHelp({
        showAliases: false,
        showExamples: false,
        colorized: false,
      });
      expect(help).toBeDefined();
    });

    it('should show general help', () => {
      const help = new CLIHelp({ colorized: false });
      help.showHelp();
      expect(mockConsole.log).toHaveBeenCalled();
      const output = mockConsole.log.mock.calls[0][0];
      expect(output).toContain('EATA');
      expect(output).toContain('USAGE');
      // When showCategories is true, it shows category names instead of 'COMMANDS'
      expect(output).toContain('TASKS');
    });

    it('should show command help', () => {
      const help = new CLIHelp({ colorized: false });
      help.showHelp('run');
      expect(mockConsole.log).toHaveBeenCalled();
      const output = mockConsole.log.mock.calls[0][0];
      expect(output).toContain('COMMAND: run');
      expect(output).toContain('USAGE');
      expect(output).toContain('OPTIONS');
    });

    it('should show help for command with aliases', () => {
      const help = new CLIHelp({ showAliases: true, colorized: false });
      help.showHelp('run');
      const output = mockConsole.log.mock.calls[0][0];
      expect(output).toContain('ALIASES');
    });

    it('should show help for config subcommand', () => {
      const help = new CLIHelp({ colorized: false });
      help.showHelp('config init');
      const output = mockConsole.log.mock.calls[0][0];
      expect(output).toContain('config init');
    });

    it('should handle unknown command', () => {
      const help = new CLIHelp({ colorized: false });
      help.showHelp('unknown');
      const output = mockConsole.log.mock.calls[0][0];
      expect(output).toContain('Unknown command');
    });
  });

  describe('findCommand', () => {
    it('should find command by name', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('run');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('run');
    });

    it('should find command by alias', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('r');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('run');
    });

    it('should find command by full name', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('config init');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('config init');
    });

    it('should return undefined for unknown command', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('unknown');
      expect(cmd).toBeUndefined();
    });
  });

  describe('getCommandNames', () => {
    it('should return all command names and aliases', () => {
      const help = new CLIHelp();
      const names = help.getCommandNames();
      expect(names).toContain('run');
      expect(names).toContain('r');
      expect(names).toContain('test');
      expect(names).toContain('t');
      expect(names).toContain('config');
      expect(names).toContain('cfg');
    });
  });

  describe('getCommandsByCategory', () => {
    it('should group commands by category', () => {
      const help = new CLIHelp();
      const categories = help.getCommandsByCategory();
      expect(categories.has('Tasks')).toBe(true);
      expect(categories.has('Configuration')).toBe(true);
      expect(categories.has('Providers')).toBe(true);
      expect(categories.has('Reports')).toBe(true);
      expect(categories.has('Server')).toBe(true);
      expect(categories.has('Utility')).toBe(true);
    });
  });

  describe('generateCompletionScript', () => {
    it('should generate bash completion script', () => {
      const help = new CLIHelp();
      const script = help.generateCompletionScript('bash');
      expect(script).toContain('_eata_completions');
      expect(script).toContain('complete -F');
    });

    it('should generate zsh completion script', () => {
      const help = new CLIHelp();
      const script = help.generateCompletionScript('zsh');
      expect(script).toContain('#compdef eata');
      expect(script).toContain('_eata()');
    });

    it('should generate fish completion script', () => {
      const help = new CLIHelp();
      const script = help.generateCompletionScript('fish');
      expect(script).toContain('complete -c eata');
    });
  });

  describe('createCLIHelp', () => {
    it('should create CLIHelp instance', () => {
      const help = createCLIHelp();
      expect(help).toBeInstanceOf(CLIHelp);
    });

    it('should create CLIHelp with options', () => {
      const help = createCLIHelp({ colorized: false });
      expect(help).toBeInstanceOf(CLIHelp);
    });
  });

  describe('resolveCommandAlias', () => {
    it('should resolve alias to canonical name', () => {
      expect(resolveCommandAlias('r')).toBe('run');
      expect(resolveCommandAlias('cfg')).toBe('config');
      expect(resolveCommandAlias('prov')).toBe('provider');
    });

    it('should return original name if not an alias', () => {
      expect(resolveCommandAlias('run')).toBe('run');
      expect(resolveCommandAlias('unknown')).toBe('unknown');
    });

    it('should handle case insensitive input', () => {
      expect(resolveCommandAlias('R')).toBe('run');
      expect(resolveCommandAlias('CFG')).toBe('config');
    });
  });
});
