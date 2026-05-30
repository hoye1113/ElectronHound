import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLIHelp, COMMANDS } from '../dx/cli-help.js';

describe('CLIHelp', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('showHelp', () => {
    it('should display help with default options', () => {
      const help = new CLIHelp();
      help.showHelp();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should display help with colorized output', () => {
      const help = new CLIHelp({ colorized: true });
      help.showHelp();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should display help without aliases', () => {
      const help = new CLIHelp({ showAliases: false });
      help.showHelp();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should display help without examples', () => {
      const help = new CLIHelp({ showExamples: false });
      help.showHelp();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should display help without categories', () => {
      const help = new CLIHelp({ showCategories: false });
      help.showHelp();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('showCommandHelp', () => {
    it('should show help for a valid command', () => {
      const help = new CLIHelp();
      help.showCommandHelp('run');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should show help with aliases', () => {
      const help = new CLIHelp({ showAliases: true });
      help.showCommandHelp('run');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should show help with examples', () => {
      const help = new CLIHelp({ showExamples: true });
      help.showCommandHelp('run');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should show error for unknown command', () => {
      const help = new CLIHelp();
      help.showCommandHelp('unknown');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should find command by alias', () => {
      const help = new CLIHelp();
      help.showCommandHelp('r');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('findCommand', () => {
    it('should find command by name', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('run');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('run');
    });

    it('should find command by alias', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('r');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('run');
    });

    it('should return undefined for unknown command', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('unknown');
      expect(cmd).toBeUndefined();
    });

    it('should be case insensitive', () => {
      const help = new CLIHelp();
      const cmd = help.findCommand('RUN');
      expect(cmd).toBeDefined();
    });
  });

  describe('getCommandNames', () => {
    it('should return all command names and aliases', () => {
      const help = new CLIHelp();
      const names = help.getCommandNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('run');
    });
  });

  describe('getCommandsByCategory', () => {
    it('should group commands by category', () => {
      const help = new CLIHelp();
      const categories = help.getCommandsByCategory();
      expect(categories.size).toBeGreaterThan(0);
    });
  });

  describe('colorize', () => {
    it('should colorize text when colorized is true', () => {
      const help = new CLIHelp({ colorized: true });
      help.showHelp();
      // Check that ANSI codes are present in output
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('\x1b[');
    });

    it('should not colorize text when colorized is false', () => {
      const help = new CLIHelp({ colorized: false });
      help.showHelp();
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      // Should not contain ANSI codes for bold
      expect(output).not.toContain('\x1b[1m');
    });
  });
});

describe('COMMANDS', () => {
  it('should have at least one command', () => {
    expect(COMMANDS.length).toBeGreaterThan(0);
  });

  it('should have valid command structure', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.name).toBeDefined();
      expect(cmd.description).toBeDefined();
      expect(cmd.usage).toBeDefined();
      expect(Array.isArray(cmd.aliases)).toBe(true);
      expect(Array.isArray(cmd.options)).toBe(true);
      expect(Array.isArray(cmd.examples)).toBe(true);
      expect(cmd.category).toBeDefined();
    }
  });
});
