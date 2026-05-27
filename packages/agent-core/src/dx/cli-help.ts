/**
 * CLI Help Enhancement for ElectronHound
 *
 * Provides improved help messages, command aliases,
 * and auto-completion support.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export interface CommandInfo {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  options: OptionInfo[];
  examples: string[];
  category: string;
}

export interface OptionInfo {
  flag: string;
  alias?: string;
  description: string;
  required?: boolean;
  defaultValue?: string;
  type?: 'string' | 'number' | 'boolean';
}

export interface CLIHelpOptions {
  showAliases?: boolean;
  showExamples?: boolean;
  showCategories?: boolean;
  colorized?: boolean;
}

// ─── Command Definitions ───────────────────────────────────────────────

export const COMMANDS: CommandInfo[] = [
  // Task commands
  {
    name: 'run',
    aliases: ['r', 'test', 't'],
    description: 'Run a test task with the AI agent',
    usage: 'eata run --goal <goal> --app <path> [options]',
    category: 'Tasks',
    options: [
      {
        flag: '--goal',
        alias: '-g',
        description: 'Test goal or objective',
        required: true,
        type: 'string',
      },
      {
        flag: '--app',
        alias: '-a',
        description: 'Path to the target Electron app',
        required: true,
        type: 'string',
      },
      {
        flag: '--model',
        alias: '-m',
        description: 'LLM model to use',
        defaultValue: 'gpt-4o',
        type: 'string',
      },
      {
        flag: '--maxSteps',
        alias: '-s',
        description: 'Maximum number of steps',
        defaultValue: '50',
        type: 'number',
      },
      {
        flag: '--provider',
        alias: '-p',
        description: 'Provider ID to use',
        type: 'string',
      },
    ],
    examples: [
      'eata run --goal "Test login flow" --app ./my-app',
      'eata run -g "Check navigation" -a ./app --model deepseek-chat',
      'eata run -g "Verify form" -a ./app --maxSteps 30',
    ],
  },

  // Configuration commands
  {
    name: 'config',
    aliases: ['cfg', 'conf'],
    description: 'Manage configuration settings',
    usage: 'eata config <subcommand> [options]',
    category: 'Configuration',
    options: [],
    examples: [
      'eata config init          # Initialize configuration',
      'eata config show          # Show current configuration',
      'eata config validate      # Validate configuration',
      'eata config edit          # Edit configuration file',
    ],
  },

  {
    name: 'config init',
    aliases: ['cfg init', 'config setup'],
    description: 'Initialize configuration with wizard',
    usage: 'eata config init [options]',
    category: 'Configuration',
    options: [
      {
        flag: '--provider',
        alias: '-p',
        description: 'Provider to configure (openai, deepseek, qwen, groq)',
        type: 'string',
      },
      {
        flag: '--apiKey',
        alias: '-k',
        description: 'API key for the provider',
        type: 'string',
      },
      {
        flag: '--non-interactive',
        description: 'Run in non-interactive mode',
        type: 'boolean',
      },
    ],
    examples: [
      'eata config init',
      'eata config init --provider openai --apiKey sk-...',
      'eata config init --non-interactive --provider deepseek --apiKey sk-...',
    ],
  },

  {
    name: 'config show',
    aliases: ['cfg show', 'config list'],
    description: 'Show current configuration',
    usage: 'eata config show [options]',
    category: 'Configuration',
    options: [
      {
        flag: '--json',
        description: 'Output as JSON',
        type: 'boolean',
      },
      {
        flag: '--secrets',
        description: 'Include API keys (masked)',
        type: 'boolean',
      },
    ],
    examples: [
      'eata config show',
      'eata config show --json',
    ],
  },

  // Provider commands
  {
    name: 'provider',
    aliases: ['prov', 'p'],
    description: 'Manage LLM providers',
    usage: 'eata provider <subcommand> [options]',
    category: 'Providers',
    options: [],
    examples: [
      'eata provider list        # List all providers',
      'eata provider add         # Add a new provider',
      'eata provider remove <id> # Remove a provider',
      'eata provider set <id>    # Set active provider',
    ],
  },

  {
    name: 'provider list',
    aliases: ['prov list', 'prov ls'],
    description: 'List all configured providers',
    usage: 'eata provider list [options]',
    category: 'Providers',
    options: [
      {
        flag: '--json',
        description: 'Output as JSON',
        type: 'boolean',
      },
      {
        flag: '--enabled',
        description: 'Show only enabled providers',
        type: 'boolean',
      },
    ],
    examples: [
      'eata provider list',
      'eata provider list --json',
    ],
  },

  {
    name: 'provider add',
    aliases: ['prov add', 'prov new'],
    description: 'Add a new LLM provider',
    usage: 'eata provider add [options]',
    category: 'Providers',
    options: [
      {
        flag: '--name',
        alias: '-n',
        description: 'Provider name',
        required: true,
        type: 'string',
      },
      {
        flag: '--baseURL',
        alias: '-u',
        description: 'API base URL',
        required: true,
        type: 'string',
      },
      {
        flag: '--model',
        alias: '-m',
        description: 'Model name',
        required: true,
        type: 'string',
      },
      {
        flag: '--apiKey',
        alias: '-k',
        description: 'API key',
        required: true,
        type: 'string',
      },
    ],
    examples: [
      'eata provider add --name "My Provider" --baseURL https://api.example.com/v1 --model gpt-4 --apiKey sk-...',
    ],
  },

  // Report commands
  {
    name: 'report',
    aliases: ['rep', 'reports'],
    description: 'View and manage test reports',
    usage: 'eata report <subcommand> [options]',
    category: 'Reports',
    options: [],
    examples: [
      'eata report list          # List all reports',
      'eata report show <id>     # Show a specific report',
      'eata report export <id>   # Export a report',
    ],
  },

  // Server commands
  {
    name: 'server',
    aliases: ['srv', 's'],
    description: 'Manage the EATA server',
    usage: 'eata server <subcommand> [options]',
    category: 'Server',
    options: [],
    examples: [
      'eata server start         # Start the server',
      'eata server stop          # Stop the server',
      'eata server status        # Check server status',
    ],
  },

  {
    name: 'server start',
    aliases: ['srv start'],
    description: 'Start the EATA server',
    usage: 'eata server start [options]',
    category: 'Server',
    options: [
      {
        flag: '--port',
        alias: '-p',
        description: 'Port to listen on',
        defaultValue: '3000',
        type: 'number',
      },
      {
        flag: '--host',
        alias: '-h',
        description: 'Host to bind to',
        defaultValue: '0.0.0.0',
        type: 'string',
      },
      {
        flag: '--logLevel',
        alias: '-l',
        description: 'Log level (trace, debug, info, warn, error, fatal)',
        defaultValue: 'info',
        type: 'string',
      },
    ],
    examples: [
      'eata server start',
      'eata server start --port 8080',
      'eata server start --logLevel debug',
    ],
  },

  // Utility commands
  {
    name: 'status',
    aliases: ['st'],
    description: 'Show system status and health',
    usage: 'eata status [options]',
    category: 'Utility',
    options: [
      {
        flag: '--json',
        description: 'Output as JSON',
        type: 'boolean',
      },
    ],
    examples: [
      'eata status',
      'eata status --json',
    ],
  },

  {
    name: 'version',
    aliases: ['v', '--version'],
    description: 'Show version information',
    usage: 'eata version',
    category: 'Utility',
    options: [],
    examples: [
      'eata version',
    ],
  },

  {
    name: 'help',
    aliases: ['h', '--help'],
    description: 'Show help information',
    usage: 'eata help [command]',
    category: 'Utility',
    options: [],
    examples: [
      'eata help',
      'eata help run',
      'eata help config init',
    ],
  },
];

// ─── CLI Help Class ────────────────────────────────────────────────────

export class CLIHelp {
  private options: CLIHelpOptions;

  constructor(options?: CLIHelpOptions) {
    this.options = {
      showAliases: true,
      showExamples: true,
      showCategories: true,
      colorized: true,
      ...options,
    };
  }

  /**
   * Show general help or help for a specific command.
   */
  showHelp(commandName?: string): void {
    if (commandName) {
      this.showCommandHelp(commandName);
    } else {
      this.showGeneralHelp();
    }
  }

  /**
   * Show general help with all commands.
   */
  showGeneralHelp(): void {
    const lines: string[] = [];

    lines.push('');
    lines.push(this.colorize('bold', 'EATA - Electron App Testing Agent'));
    lines.push(this.colorize('dim', 'AI-powered testing for Electron applications'));
    lines.push('');
    lines.push(this.colorize('bold', 'USAGE'));
    lines.push('  eata <command> [options]');
    lines.push('');

    if (this.options.showCategories) {
      this.showCategorizedCommands(lines);
    } else {
      this.showAllCommands(lines);
    }

    lines.push(this.colorize('bold', 'GLOBAL OPTIONS'));
    lines.push('  --help, -h     Show help information');
    lines.push('  --version, -v  Show version information');
    lines.push('  --verbose       Enable verbose output');
    lines.push('  --quiet         Suppress non-error output');
    lines.push('');

    lines.push(this.colorize('bold', 'EXAMPLES'));
    lines.push('  eata run --goal "Test login" --app ./my-app');
    lines.push('  eata config init');
    lines.push('  eata provider list');
    lines.push('  eata server start');
    lines.push('');

    lines.push(this.colorize('dim', 'For more information on a command, run: eata help <command>'));
    lines.push('');

    console.log(lines.join('\n'));
  }

  /**
   * Show help for a specific command.
   */
  showCommandHelp(commandName: string): void {
    const command = this.findCommand(commandName);
    if (!command) {
      console.log(`\nUnknown command: ${commandName}`);
      console.log('Run "eata help" to see available commands.\n');
      return;
    }

    const lines: string[] = [];

    lines.push('');
    lines.push(this.colorize('bold', `COMMAND: ${command.name}`));
    lines.push(`  ${command.description}`);
    lines.push('');

    lines.push(this.colorize('bold', 'USAGE'));
    lines.push(`  ${command.usage}`);
    lines.push('');

    if (this.options.showAliases && command.aliases.length > 0) {
      lines.push(this.colorize('bold', 'ALIASES'));
      lines.push(`  ${command.aliases.join(', ')}`);
      lines.push('');
    }

    if (command.options.length > 0) {
      lines.push(this.colorize('bold', 'OPTIONS'));
      for (const opt of command.options) {
        const required = opt.required ? this.colorize('red', ' (required)') : '';
        const defaultVal = opt.defaultValue ? this.colorize('dim', ` [default: ${opt.defaultValue}]`) : '';
        const flag = opt.alias ? `${opt.flag}, ${opt.alias}` : opt.flag;
        lines.push(`  ${flag.padEnd(20)} ${opt.description}${required}${defaultVal}`);
      }
      lines.push('');
    }

    if (this.options.showExamples && command.examples.length > 0) {
      lines.push(this.colorize('bold', 'EXAMPLES'));
      for (const example of command.examples) {
        lines.push(`  ${example}`);
      }
      lines.push('');
    }

    console.log(lines.join('\n'));
  }

  /**
   * Find a command by name or alias.
   */
  findCommand(name: string): CommandInfo | undefined {
    const normalizedName = name.toLowerCase();
    return COMMANDS.find(
      (cmd) =>
        cmd.name === normalizedName ||
        cmd.aliases.includes(normalizedName) ||
        cmd.name.endsWith(normalizedName),
    );
  }

  /**
   * Get all command names for auto-completion.
   */
  getCommandNames(): string[] {
    const names: string[] = [];
    for (const cmd of COMMANDS) {
      names.push(cmd.name);
      names.push(...cmd.aliases);
    }
    return [...new Set(names)];
  }

  /**
   * Get commands by category.
   */
  getCommandsByCategory(): Map<string, CommandInfo[]> {
    const categories = new Map<string, CommandInfo[]>();
    for (const cmd of COMMANDS) {
      const existing = categories.get(cmd.category) ?? [];
      existing.push(cmd);
      categories.set(cmd.category, existing);
    }
    return categories;
  }

  /**
   * Generate shell completion script.
   */
  generateCompletionScript(shell: 'bash' | 'zsh' | 'fish'): string {
    switch (shell) {
      case 'bash':
        return this.generateBashCompletion();
      case 'zsh':
        return this.generateZshCompletion();
      case 'fish':
        return this.generateFishCompletion();
      default:
        return '';
    }
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private showCategorizedCommands(lines: string[]): void {
    const categories = this.getCommandsByCategory();
    for (const [category, commands] of categories) {
      lines.push(this.colorize('bold', category.toUpperCase()));
      for (const cmd of commands) {
        if (!cmd.name.includes(' ')) {
          // Only show top-level commands in the overview
          const aliases = this.options.showAliases && cmd.aliases.length > 0
            ? this.colorize('dim', ` (${cmd.aliases.join(', ')})`)
            : '';
          lines.push(`  ${cmd.name.padEnd(15)} ${cmd.description}${aliases}`);
        }
      }
      lines.push('');
    }
  }

  private showAllCommands(lines: string[]): void {
    lines.push(this.colorize('bold', 'COMMANDS'));
    for (const cmd of COMMANDS) {
      if (!cmd.name.includes(' ')) {
        const aliases = this.options.showAliases && cmd.aliases.length > 0
          ? this.colorize('dim', ` (${cmd.aliases.join(', ')})`)
          : '';
        lines.push(`  ${cmd.name.padEnd(15)} ${cmd.description}${aliases}`);
      }
    }
    lines.push('');
  }

  private colorize(style: string, text: string): string {
    if (!this.options.colorized) return text;

    const colors: Record<string, string> = {
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      reset: '\x1b[0m',
    };

    const color = colors[style];
    if (!color) return text;

    return `${color}${text}${colors.reset}`;
  }

  private generateBashCompletion(): string {
    const commands = this.getCommandNames().join(' ');
    return `#!/bin/bash
# EATA bash completion script
_eata_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${commands}"

  if [[ \${cur} == -* ]] ; then
    COMPREPLY=( $(compgen -W "--help --version --verbose --quiet" -- \${cur}) )
    return 0
  fi

  COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
  return 0
}
complete -F _eata_completions eata
`;
  }

  private generateZshCompletion(): string {
    const commands = this.getCommandNames();
    const commandList = commands.map((cmd) => `"${cmd}"`).join(' ');
    return `#compdef eata

_eata() {
  local -a commands
  commands=(
    ${commands.map((cmd) => `"${cmd}"`).join('\n    ')}
  )

  _arguments \\
    '1:command:->commands' \\
    '*::arg:->args'

  case \$state in
    commands)
      _describe 'command' commands
      ;;
    args)
      case \$words[1] in
        run)
          _arguments \\
            '--goal[Test goal]' \\
            '--app[Target app path]' \\
            '--model[LLM model]' \\
            '--maxSteps[Max steps]' \\
            '--provider[Provider ID]'
          ;;
        config)
          _arguments \\
            '1:subcommand:(init show validate edit)'
          ;;
        provider)
          _arguments \\
            '1:subcommand:(list add remove set)'
          ;;
      esac
      ;;
  esac
}

_eata
`;
  }

  private generateFishCompletion(): string {
    const commands = this.getCommandNames();
    return `# EATA fish completion script
${commands.map((cmd) => `complete -c eata -f -n '__fish_use_subcommand' -a ${cmd}`).join('\n')}

complete -c eata -f -n '__fish_seen_subcommand_from run' -l goal -d 'Test goal'
complete -c eata -f -n '__fish_seen_subcommand_from run' -l app -d 'Target app path'
complete -c eata -f -n '__fish_seen_subcommand_from run' -l model -d 'LLM model'
complete -c eata -f -n '__fish_seen_subcommand_from run' -l maxSteps -d 'Max steps'
complete -c eata -f -n '__fish_seen_subcommand_from run' -l provider -d 'Provider ID'

complete -c eata -f -n '__fish_seen_subcommand_from config' -a 'init show validate edit'
complete -c eata -f -n '__fish_seen_subcommand_from provider' -a 'list add remove set'
`;
  }
}

// ─── Convenience Functions ─────────────────────────────────────────────

/**
 * Create a CLI help instance with default options.
 */
export function createCLIHelp(options?: CLIHelpOptions): CLIHelp {
  return new CLIHelp(options);
}

/**
 * Show help for a command.
 */
export function showHelp(command?: string): void {
  const help = new CLIHelp();
  help.showHelp(command);
}

/**
 * Parse command aliases to canonical name.
 */
export function resolveCommandAlias(alias: string): string {
  const normalizedName = alias.toLowerCase();
  const command = COMMANDS.find(
    (cmd) =>
      cmd.name === normalizedName ||
      cmd.aliases.includes(normalizedName),
  );
  return command?.name ?? alias;
}
