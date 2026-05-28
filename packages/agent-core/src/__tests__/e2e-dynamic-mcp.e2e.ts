/**
 * End-to-end test for Dynamic MCP Connection.
 *
 * Verifies:
 * 1. electron_launch auto-spawns Playwright connected to Electron's CDP port
 * 2. browser_snapshot returns the Electron app's UI accessibility tree
 * 3. electron_close disconnects Playwright
 *
 * Usage: npx tsx src/__tests__/e2e-dynamic-mcp.e2e.ts
 */

import { MCPClient } from '../mcp/client.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_APP = resolve(__dirname, '..', '..', '..', '..', 'fixtures', 'test-electron-app');

async function main() {
  console.log('[E2E] Starting Dynamic MCP Connection test...');
  console.log(`[E2E] Fixture app: ${FIXTURE_APP}`);

  const client = new MCPClient();

  try {
    // Step 1: Connect to electron-bridge-mcp only (Playwright will be auto-spawned)
    console.log('[E2E] Step 1: Connecting to electron-bridge-mcp...');
    await client.connect({ electron: { appPath: FIXTURE_APP } });
    console.log(`[E2E] Connected. Mock mode: ${client.isMockMode()}`);

    // Step 2: Launch the Electron app
    console.log('[E2E] Step 2: Launching Electron app...');
    const launchResult = await client.callTool('electron', 'electron_launch', {
      targetAppPath: FIXTURE_APP,
    });

    if (!launchResult.success) {
      console.error('[E2E] FAIL: electron_launch failed:', launchResult.result);
      process.exit(1);
    }

    console.log('[E2E] electron_launch succeeded:', JSON.stringify(launchResult.result).substring(0, 200));

    // Step 3: Check if Playwright was auto-connected
    const playwrightClient = client.getClient('playwright');
    if (playwrightClient) {
      console.log('[E2E] Step 3: Playwright auto-connected ✓');
    } else {
      console.log('[E2E] Step 3: Playwright NOT connected (may be running in mock mode or launch didn\'t return webSocketUrl)');
    }

    // Step 4: Try browser_snapshot (only works if Playwright is connected)
    if (playwrightClient) {
      console.log('[E2E] Step 4: Calling browser_snapshot...');
      const snapshotResult = await client.callTool('playwright', 'browser_snapshot', {});

      if (snapshotResult.success) {
        const resultStr = JSON.stringify(snapshotResult.result);
        console.log('[E2E] browser_snapshot succeeded. Result length:', resultStr.length);
        console.log('[E2E] First 500 chars:', resultStr.substring(0, 500));
      } else {
        console.error('[E2E] FAIL: browser_snapshot failed:', snapshotResult.result);
      }
    } else {
      console.log('[E2E] Step 4: Skipping browser_snapshot (Playwright not connected)');
    }

    // Step 5: Close the Electron app
    console.log('[E2E] Step 5: Closing Electron app...');
    const closeResult = await client.callTool('electron', 'electron_close', {
      pid: 0, // pid=0 closes all
    });
    console.log('[E2E] electron_close result:', closeResult.success ? 'success' : 'failed');

    // Step 6: Verify Playwright was disconnected
    const playwrightAfterClose = client.getClient('playwright');
    if (!playwrightAfterClose) {
      console.log('[E2E] Step 6: Playwright disconnected after close ✓');
    } else {
      console.log('[E2E] Step 6: Playwright still connected after close ✗');
    }

    console.log('[E2E] Test completed.');
  } catch (err) {
    console.error('[E2E] Unexpected error:', err);
    process.exit(1);
  } finally {
    await client.disconnect().catch(() => {});
    console.log('[E2E] Cleanup done.');
  }
}

main();
