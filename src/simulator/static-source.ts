import type { EndpointRecord } from "../analysis/types";
import type { EndpointSnapshot, SimulatorDataSource } from "./types";

/**
 * Adapts the static scan EndpointRecord[] to the SimulatorDataSource interface.
 * Derives perCallCost from the pre-calculated monthlyCost and callsPerDay.
 */
export class StaticDataSource implements SimulatorDataSource {
  constructor(private readonly endpoints: EndpointRecord[]) {}

  getEndpoints(): EndpointSnapshot[] {
    return this.endpoints.map((ep) => {
      const dailyCalls = ep.callsPerDay > 0 ? ep.callsPerDay : 1;
      // Free endpoints always have zero cost regardless of monthlyCost estimate
      const perCallCostRaw = ep.costModel === "free"
        ? 0
        : ep.monthlyCost / (dailyCalls * 30);

      return {
        id: ep.id,
        provider: ep.provider,
        method: ep.method,
        url: ep.url,
        baseCallsPerDay: dailyCalls,
        perCallCost: isFinite(perCallCostRaw) && perCallCostRaw > 0 ? perCallCostRaw : 0,
        frequencyClass: ep.frequencyClass,
        costModel: ep.costModel,
      };
    });
  }
}
