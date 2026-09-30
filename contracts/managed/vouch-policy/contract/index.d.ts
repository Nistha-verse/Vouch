import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getOwnerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getTaskAgentSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getResearchAgentSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getDeveloperAgentSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getCustomAgentSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getPolicy(context: __compactRuntime.WitnessContext<Ledger, PS>,
            amount_0: bigint): [PS, [bigint, bigint, bigint]];
}

export type ImpureCircuits<PS> = {
  authorizeTaskAgent(context: __compactRuntime.CircuitContext<PS>,
                     agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeResearchAgent(context: __compactRuntime.CircuitContext<PS>,
                         agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeDeveloperAgent(context: __compactRuntime.CircuitContext<PS>,
                          agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeCustomAgent(context: __compactRuntime.CircuitContext<PS>,
                       agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestTaskSpend(context: __compactRuntime.CircuitContext<PS>,
                   amount_0: bigint,
                   recipientCommitment_0: Uint8Array,
                   categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestResearchSpend(context: __compactRuntime.CircuitContext<PS>,
                       amount_0: bigint,
                       recipientCommitment_0: Uint8Array,
                       categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestDeveloperSpend(context: __compactRuntime.CircuitContext<PS>,
                        amount_0: bigint,
                        recipientCommitment_0: Uint8Array,
                        categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestCustomSpend(context: __compactRuntime.CircuitContext<PS>,
                     amount_0: bigint,
                     recipientCommitment_0: Uint8Array,
                     categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  authorizeTaskAgent(context: __compactRuntime.CircuitContext<PS>,
                     agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeResearchAgent(context: __compactRuntime.CircuitContext<PS>,
                         agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeDeveloperAgent(context: __compactRuntime.CircuitContext<PS>,
                          agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeCustomAgent(context: __compactRuntime.CircuitContext<PS>,
                       agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestTaskSpend(context: __compactRuntime.CircuitContext<PS>,
                   amount_0: bigint,
                   recipientCommitment_0: Uint8Array,
                   categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestResearchSpend(context: __compactRuntime.CircuitContext<PS>,
                       amount_0: bigint,
                       recipientCommitment_0: Uint8Array,
                       categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestDeveloperSpend(context: __compactRuntime.CircuitContext<PS>,
                        amount_0: bigint,
                        recipientCommitment_0: Uint8Array,
                        categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestCustomSpend(context: __compactRuntime.CircuitContext<PS>,
                     amount_0: bigint,
                     recipientCommitment_0: Uint8Array,
                     categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  authorizeTaskAgent(context: __compactRuntime.CircuitContext<PS>,
                     agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeResearchAgent(context: __compactRuntime.CircuitContext<PS>,
                         agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeDeveloperAgent(context: __compactRuntime.CircuitContext<PS>,
                          agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeCustomAgent(context: __compactRuntime.CircuitContext<PS>,
                       agentCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestTaskSpend(context: __compactRuntime.CircuitContext<PS>,
                   amount_0: bigint,
                   recipientCommitment_0: Uint8Array,
                   categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestResearchSpend(context: __compactRuntime.CircuitContext<PS>,
                       amount_0: bigint,
                       recipientCommitment_0: Uint8Array,
                       categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestDeveloperSpend(context: __compactRuntime.CircuitContext<PS>,
                        amount_0: bigint,
                        recipientCommitment_0: Uint8Array,
                        categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  requestCustomSpend(context: __compactRuntime.CircuitContext<PS>,
                     amount_0: bigint,
                     recipientCommitment_0: Uint8Array,
                     categoryCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly ownerCommitment: Uint8Array;
  readonly taskAgentCommitment: Uint8Array;
  readonly researchAgentCommitment: Uint8Array;
  readonly developerAgentCommitment: Uint8Array;
  readonly customAgentCommitment: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
