import { AIWorkerRegistry } from "../AIWorkerRegistry";
import { builtinWorkers } from "../builtins/BuiltinWorkers";
import type { AIWorkerInstaller } from "./AIWorkerInstaller";

/**
 * Installs every AI worker built into Faith Harbor OS.
 */
export class BuiltinWorkerInstaller
  implements AIWorkerInstaller
{
  install(
    registry: AIWorkerRegistry,
  ): void {
    for (const worker of builtinWorkers) {
      registry.register(worker);
    }
  }
}