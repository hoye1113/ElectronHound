export interface Operation {
  type:
    | 'execute_main'
    | 'send_ipc'
    | 'mock_dialog'
    | 'get_menu_items'
    | 'health_check';
  payload?: Record<string, unknown>;
}

export interface OperationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Handles operations dispatched from the electron-bridge-mcp server.
 * v0.1: health_check is fully implemented; other operations return mock/placeholder results.
 */
export class OperationHandler {
  /**
   * Dispatch an operation and return the result.
   */
  async handle(operation: Operation): Promise<OperationResult> {
    switch (operation.type) {
      case 'health_check':
        return this.handleHealthCheck();
      case 'execute_main':
        return this.handleExecuteMain(operation.payload);
      case 'send_ipc':
        return this.handleSendIpc(operation.payload);
      case 'mock_dialog':
        return this.handleMockDialog(operation.payload);
      case 'get_menu_items':
        return this.handleGetMenuItems();
      default:
        return {
          success: false,
          error: `Unknown operation type: ${(operation as Operation).type}`,
        };
    }
  }

  private handleHealthCheck(): OperationResult {
    return {
      success: true,
      data: { status: 'ok' },
    };
  }

  private handleExecuteMain(
    _payload: Record<string, unknown> | undefined,
  ): OperationResult {
    // v0.1: placeholder — real implementation in Task 8
    return {
      success: true,
      data: {
        status: 'placeholder',
        message: 'execute_main not yet implemented',
      },
    };
  }

  private handleSendIpc(
    _payload: Record<string, unknown> | undefined,
  ): OperationResult {
    // v0.1: placeholder
    return {
      success: true,
      data: {
        status: 'placeholder',
        message: 'send_ipc not yet implemented',
      },
    };
  }

  private handleMockDialog(
    _payload: Record<string, unknown> | undefined,
  ): OperationResult {
    // v0.1: placeholder
    return {
      success: true,
      data: {
        status: 'placeholder',
        message: 'mock_dialog not yet implemented',
      },
    };
  }

  private handleGetMenuItems(): OperationResult {
    // v0.1: placeholder
    return {
      success: true,
      data: {
        status: 'placeholder',
        message: 'get_menu_items not yet implemented',
        items: [],
      },
    };
  }
}
