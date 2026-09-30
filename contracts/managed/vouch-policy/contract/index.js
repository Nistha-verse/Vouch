import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.16.0');

const _descriptor_0 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_1 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

class _tuple_0 {
  alignment() {
    return _descriptor_1.alignment().concat(_descriptor_1.alignment().concat(_descriptor_1.alignment()));
  }
  fromValue(value_0) {
    return [
      _descriptor_1.fromValue(value_0),
      _descriptor_1.fromValue(value_0),
      _descriptor_1.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_1.toValue(value_0[0]).concat(_descriptor_1.toValue(value_0[1]).concat(_descriptor_1.toValue(value_0[2])));
  }
}

const _descriptor_2 = new _tuple_0();

const _descriptor_3 = __compactRuntime.CompactTypeBoolean;

class _Either_0 {
  alignment() {
    return _descriptor_3.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_3.fromValue(value_0),
      left: _descriptor_0.fromValue(value_0),
      right: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.is_left).concat(_descriptor_0.toValue(value_0.left).concat(_descriptor_0.toValue(value_0.right)));
  }
}

const _descriptor_4 = new _Either_0();

const _descriptor_5 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _ContractAddress_0 {
  alignment() {
    return _descriptor_0.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.bytes);
  }
}

const _descriptor_6 = new _ContractAddress_0();

const _descriptor_7 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    if (typeof(witnesses_0.getOwnerSecret) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named getOwnerSecret');
    }
    if (typeof(witnesses_0.getTaskAgentSecret) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named getTaskAgentSecret');
    }
    if (typeof(witnesses_0.getResearchAgentSecret) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named getResearchAgentSecret');
    }
    if (typeof(witnesses_0.getDeveloperAgentSecret) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named getDeveloperAgentSecret');
    }
    if (typeof(witnesses_0.getCustomAgentSecret) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named getCustomAgentSecret');
    }
    if (typeof(witnesses_0.getPolicy) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named getPolicy');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      authorizeTaskAgent: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`authorizeTaskAgent: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const agentCommitment_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('authorizeTaskAgent',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 25 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(agentCommitment_0.buffer instanceof ArrayBuffer && agentCommitment_0.BYTES_PER_ELEMENT === 1 && agentCommitment_0.length === 32)) {
          __compactRuntime.typeError('authorizeTaskAgent',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 25 char 1',
                                     'Bytes<32>',
                                     agentCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(agentCommitment_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._authorizeTaskAgent_0(context,
                                                    partialProofData,
                                                    agentCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      authorizeResearchAgent: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`authorizeResearchAgent: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const agentCommitment_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('authorizeResearchAgent',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 34 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(agentCommitment_0.buffer instanceof ArrayBuffer && agentCommitment_0.BYTES_PER_ELEMENT === 1 && agentCommitment_0.length === 32)) {
          __compactRuntime.typeError('authorizeResearchAgent',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 34 char 1',
                                     'Bytes<32>',
                                     agentCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(agentCommitment_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._authorizeResearchAgent_0(context,
                                                        partialProofData,
                                                        agentCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      authorizeDeveloperAgent: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`authorizeDeveloperAgent: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const agentCommitment_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('authorizeDeveloperAgent',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 40 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(agentCommitment_0.buffer instanceof ArrayBuffer && agentCommitment_0.BYTES_PER_ELEMENT === 1 && agentCommitment_0.length === 32)) {
          __compactRuntime.typeError('authorizeDeveloperAgent',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 40 char 1',
                                     'Bytes<32>',
                                     agentCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(agentCommitment_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._authorizeDeveloperAgent_0(context,
                                                         partialProofData,
                                                         agentCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      authorizeCustomAgent: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`authorizeCustomAgent: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const agentCommitment_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('authorizeCustomAgent',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 46 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(agentCommitment_0.buffer instanceof ArrayBuffer && agentCommitment_0.BYTES_PER_ELEMENT === 1 && agentCommitment_0.length === 32)) {
          __compactRuntime.typeError('authorizeCustomAgent',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 46 char 1',
                                     'Bytes<32>',
                                     agentCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(agentCommitment_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._authorizeCustomAgent_0(context,
                                                      partialProofData,
                                                      agentCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      requestTaskSpend: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`requestTaskSpend: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amount_0 = args_1[1];
        const recipientCommitment_0 = args_1[2];
        const categoryCommitment_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('requestTaskSpend',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 53 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amount_0) === 'bigint' && amount_0 >= 0n && amount_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('requestTaskSpend',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 53 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount_0)
        }
        if (!(recipientCommitment_0.buffer instanceof ArrayBuffer && recipientCommitment_0.BYTES_PER_ELEMENT === 1 && recipientCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestTaskSpend',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'vouch-policy.compact line 53 char 1',
                                     'Bytes<32>',
                                     recipientCommitment_0)
        }
        if (!(categoryCommitment_0.buffer instanceof ArrayBuffer && categoryCommitment_0.BYTES_PER_ELEMENT === 1 && categoryCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestTaskSpend',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'vouch-policy.compact line 53 char 1',
                                     'Bytes<32>',
                                     categoryCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(amount_0).concat(_descriptor_0.toValue(recipientCommitment_0).concat(_descriptor_0.toValue(categoryCommitment_0))),
            alignment: _descriptor_1.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._requestTaskSpend_0(context,
                                                  partialProofData,
                                                  amount_0,
                                                  recipientCommitment_0,
                                                  categoryCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      requestResearchSpend: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`requestResearchSpend: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amount_0 = args_1[1];
        const recipientCommitment_0 = args_1[2];
        const categoryCommitment_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('requestResearchSpend',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 69 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amount_0) === 'bigint' && amount_0 >= 0n && amount_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('requestResearchSpend',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 69 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount_0)
        }
        if (!(recipientCommitment_0.buffer instanceof ArrayBuffer && recipientCommitment_0.BYTES_PER_ELEMENT === 1 && recipientCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestResearchSpend',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'vouch-policy.compact line 69 char 1',
                                     'Bytes<32>',
                                     recipientCommitment_0)
        }
        if (!(categoryCommitment_0.buffer instanceof ArrayBuffer && categoryCommitment_0.BYTES_PER_ELEMENT === 1 && categoryCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestResearchSpend',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'vouch-policy.compact line 69 char 1',
                                     'Bytes<32>',
                                     categoryCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(amount_0).concat(_descriptor_0.toValue(recipientCommitment_0).concat(_descriptor_0.toValue(categoryCommitment_0))),
            alignment: _descriptor_1.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._requestResearchSpend_0(context,
                                                      partialProofData,
                                                      amount_0,
                                                      recipientCommitment_0,
                                                      categoryCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      requestDeveloperSpend: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`requestDeveloperSpend: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amount_0 = args_1[1];
        const recipientCommitment_0 = args_1[2];
        const categoryCommitment_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('requestDeveloperSpend',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 77 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amount_0) === 'bigint' && amount_0 >= 0n && amount_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('requestDeveloperSpend',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 77 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount_0)
        }
        if (!(recipientCommitment_0.buffer instanceof ArrayBuffer && recipientCommitment_0.BYTES_PER_ELEMENT === 1 && recipientCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestDeveloperSpend',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'vouch-policy.compact line 77 char 1',
                                     'Bytes<32>',
                                     recipientCommitment_0)
        }
        if (!(categoryCommitment_0.buffer instanceof ArrayBuffer && categoryCommitment_0.BYTES_PER_ELEMENT === 1 && categoryCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestDeveloperSpend',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'vouch-policy.compact line 77 char 1',
                                     'Bytes<32>',
                                     categoryCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(amount_0).concat(_descriptor_0.toValue(recipientCommitment_0).concat(_descriptor_0.toValue(categoryCommitment_0))),
            alignment: _descriptor_1.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._requestDeveloperSpend_0(context,
                                                       partialProofData,
                                                       amount_0,
                                                       recipientCommitment_0,
                                                       categoryCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      },
      requestCustomSpend: (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`requestCustomSpend: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const amount_0 = args_1[1];
        const recipientCommitment_0 = args_1[2];
        const categoryCommitment_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.currentQueryContext != undefined)) {
          __compactRuntime.typeError('requestCustomSpend',
                                     'argument 1 (as invoked from Typescript)',
                                     'vouch-policy.compact line 85 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(typeof(amount_0) === 'bigint' && amount_0 >= 0n && amount_0 <= 18446744073709551615n)) {
          __compactRuntime.typeError('requestCustomSpend',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'vouch-policy.compact line 85 char 1',
                                     'Uint<0..18446744073709551616>',
                                     amount_0)
        }
        if (!(recipientCommitment_0.buffer instanceof ArrayBuffer && recipientCommitment_0.BYTES_PER_ELEMENT === 1 && recipientCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestCustomSpend',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'vouch-policy.compact line 85 char 1',
                                     'Bytes<32>',
                                     recipientCommitment_0)
        }
        if (!(categoryCommitment_0.buffer instanceof ArrayBuffer && categoryCommitment_0.BYTES_PER_ELEMENT === 1 && categoryCommitment_0.length === 32)) {
          __compactRuntime.typeError('requestCustomSpend',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'vouch-policy.compact line 85 char 1',
                                     'Bytes<32>',
                                     categoryCommitment_0)
        }
        const context = { ...contextOrig_0, gasCost: __compactRuntime.emptyRunningCost() };
        const partialProofData = {
          input: {
            value: _descriptor_1.toValue(amount_0).concat(_descriptor_0.toValue(recipientCommitment_0).concat(_descriptor_0.toValue(categoryCommitment_0))),
            alignment: _descriptor_1.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._requestCustomSpend_0(context,
                                                    partialProofData,
                                                    amount_0,
                                                    recipientCommitment_0,
                                                    categoryCommitment_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData, gasCost: context.gasCost };
      }
    };
    this.impureCircuits = {
      authorizeTaskAgent: this.circuits.authorizeTaskAgent,
      authorizeResearchAgent: this.circuits.authorizeResearchAgent,
      authorizeDeveloperAgent: this.circuits.authorizeDeveloperAgent,
      authorizeCustomAgent: this.circuits.authorizeCustomAgent,
      requestTaskSpend: this.circuits.requestTaskSpend,
      requestResearchSpend: this.circuits.requestResearchSpend,
      requestDeveloperSpend: this.circuits.requestDeveloperSpend,
      requestCustomSpend: this.circuits.requestCustomSpend
    };
    this.provableCircuits = {
      authorizeTaskAgent: this.circuits.authorizeTaskAgent,
      authorizeResearchAgent: this.circuits.authorizeResearchAgent,
      authorizeDeveloperAgent: this.circuits.authorizeDeveloperAgent,
      authorizeCustomAgent: this.circuits.authorizeCustomAgent,
      requestTaskSpend: this.circuits.requestTaskSpend,
      requestResearchSpend: this.circuits.requestResearchSpend,
      requestDeveloperSpend: this.circuits.requestDeveloperSpend,
      requestCustomSpend: this.circuits.requestCustomSpend
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialPrivateState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialPrivateState' in argument 1 (as invoked from Typescript)`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('authorizeTaskAgent', new __compactRuntime.ContractOperation());
    state_0.setOperation('authorizeResearchAgent', new __compactRuntime.ContractOperation());
    state_0.setOperation('authorizeDeveloperAgent', new __compactRuntime.ContractOperation());
    state_0.setOperation('authorizeCustomAgent', new __compactRuntime.ContractOperation());
    state_0.setOperation('requestTaskSpend', new __compactRuntime.ContractOperation());
    state_0.setOperation('requestResearchSpend', new __compactRuntime.ContractOperation());
    state_0.setOperation('requestDeveloperSpend', new __compactRuntime.ContractOperation());
    state_0.setOperation('requestCustomSpend', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext(__compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(0n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(1n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(2n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(3n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(4n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    const tmp_0 = this._persistentHash_0(this._getOwnerSecret_0(context,
                                                                partialProofData));
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(0n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _persistentHash_0(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_0, value_0);
    return result_0;
  }
  _getOwnerSecret_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.getOwnerSecret(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('getOwnerSecret',
                                 'return value',
                                 'vouch-policy.compact line 16 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_0.toValue(result_0),
      alignment: _descriptor_0.alignment()
    });
    return result_0;
  }
  _getTaskAgentSecret_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.getTaskAgentSecret(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('getTaskAgentSecret',
                                 'return value',
                                 'vouch-policy.compact line 17 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_0.toValue(result_0),
      alignment: _descriptor_0.alignment()
    });
    return result_0;
  }
  _getResearchAgentSecret_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.getResearchAgentSecret(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('getResearchAgentSecret',
                                 'return value',
                                 'vouch-policy.compact line 18 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_0.toValue(result_0),
      alignment: _descriptor_0.alignment()
    });
    return result_0;
  }
  _getDeveloperAgentSecret_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.getDeveloperAgentSecret(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('getDeveloperAgentSecret',
                                 'return value',
                                 'vouch-policy.compact line 19 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_0.toValue(result_0),
      alignment: _descriptor_0.alignment()
    });
    return result_0;
  }
  _getCustomAgentSecret_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.getCustomAgentSecret(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('getCustomAgentSecret',
                                 'return value',
                                 'vouch-policy.compact line 20 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_0.toValue(result_0),
      alignment: _descriptor_0.alignment()
    });
    return result_0;
  }
  _getPolicy_0(context, partialProofData, amount_0) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.currentQueryContext.state), context.currentPrivateState, context.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.getPolicy(witnessContext_0,
                                                                    amount_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(Array.isArray(result_0) && result_0.length === 3  && typeof(result_0[0]) === 'bigint' && result_0[0] >= 0n && result_0[0] <= 18446744073709551615n && typeof(result_0[1]) === 'bigint' && result_0[1] >= 0n && result_0[1] <= 18446744073709551615n && typeof(result_0[2]) === 'bigint' && result_0[2] >= 0n && result_0[2] <= 18446744073709551615n)) {
      __compactRuntime.typeError('getPolicy',
                                 'return value',
                                 'vouch-policy.compact line 23 char 1',
                                 '[Uint<0..18446744073709551616>, Uint<0..18446744073709551616>, Uint<0..18446744073709551616>]',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_2.toValue(result_0),
      alignment: _descriptor_2.alignment()
    });
    return result_0;
  }
  _authorizeTaskAgent_0(context, partialProofData, agentCommitment_0) {
    __compactRuntime.assert(this._equal_0(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_7.toValue(0n),
                                                                                                                                alignment: _descriptor_7.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._persistentHash_0(this._getOwnerSecret_0(context,
                                                                                        partialProofData))),
                            'Only the owner can authorize an agent');
    __compactRuntime.assert(!this._equal_1(agentCommitment_0,
                                           _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                     partialProofData,
                                                                                                     [
                                                                                                      { dup: { n: 0 } },
                                                                                                      { idx: { cached: false,
                                                                                                               pushPath: false,
                                                                                                               path: [
                                                                                                                      { tag: 'value',
                                                                                                                        value: { value: _descriptor_7.toValue(0n),
                                                                                                                                 alignment: _descriptor_7.alignment() } }] } },
                                                                                                      { popeq: { cached: false,
                                                                                                                 result: undefined } }]).value)),
                            'Owner cannot authorize itself as agent');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(1n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(agentCommitment_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _authorizeResearchAgent_0(context, partialProofData, agentCommitment_0) {
    __compactRuntime.assert(this._equal_2(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_7.toValue(0n),
                                                                                                                                alignment: _descriptor_7.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._persistentHash_0(this._getOwnerSecret_0(context,
                                                                                        partialProofData))),
                            'Only the owner can authorize an agent');
    __compactRuntime.assert(!this._equal_3(agentCommitment_0,
                                           _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                     partialProofData,
                                                                                                     [
                                                                                                      { dup: { n: 0 } },
                                                                                                      { idx: { cached: false,
                                                                                                               pushPath: false,
                                                                                                               path: [
                                                                                                                      { tag: 'value',
                                                                                                                        value: { value: _descriptor_7.toValue(0n),
                                                                                                                                 alignment: _descriptor_7.alignment() } }] } },
                                                                                                      { popeq: { cached: false,
                                                                                                                 result: undefined } }]).value)),
                            'Owner cannot authorize itself as agent');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(2n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(agentCommitment_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _authorizeDeveloperAgent_0(context, partialProofData, agentCommitment_0) {
    __compactRuntime.assert(this._equal_4(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_7.toValue(0n),
                                                                                                                                alignment: _descriptor_7.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._persistentHash_0(this._getOwnerSecret_0(context,
                                                                                        partialProofData))),
                            'Only the owner can authorize an agent');
    __compactRuntime.assert(!this._equal_5(agentCommitment_0,
                                           _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                     partialProofData,
                                                                                                     [
                                                                                                      { dup: { n: 0 } },
                                                                                                      { idx: { cached: false,
                                                                                                               pushPath: false,
                                                                                                               path: [
                                                                                                                      { tag: 'value',
                                                                                                                        value: { value: _descriptor_7.toValue(0n),
                                                                                                                                 alignment: _descriptor_7.alignment() } }] } },
                                                                                                      { popeq: { cached: false,
                                                                                                                 result: undefined } }]).value)),
                            'Owner cannot authorize itself as agent');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(3n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(agentCommitment_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _authorizeCustomAgent_0(context, partialProofData, agentCommitment_0) {
    __compactRuntime.assert(this._equal_6(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_7.toValue(0n),
                                                                                                                                alignment: _descriptor_7.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._persistentHash_0(this._getOwnerSecret_0(context,
                                                                                        partialProofData))),
                            'Only the owner can authorize an agent');
    __compactRuntime.assert(!this._equal_7(agentCommitment_0,
                                           _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                     partialProofData,
                                                                                                     [
                                                                                                      { dup: { n: 0 } },
                                                                                                      { idx: { cached: false,
                                                                                                               pushPath: false,
                                                                                                               path: [
                                                                                                                      { tag: 'value',
                                                                                                                        value: { value: _descriptor_7.toValue(0n),
                                                                                                                                 alignment: _descriptor_7.alignment() } }] } },
                                                                                                      { popeq: { cached: false,
                                                                                                                 result: undefined } }]).value)),
                            'Owner cannot authorize itself as agent');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_7.toValue(4n),
                                                                                              alignment: _descriptor_7.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(agentCommitment_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    return [];
  }
  _requestTaskSpend_0(context,
                      partialProofData,
                      amount_0,
                      recipientCommitment_0,
                      categoryCommitment_0)
  {
    __compactRuntime.assert(this._equal_8(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_7.toValue(1n),
                                                                                                                                alignment: _descriptor_7.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._persistentHash_0(this._getTaskAgentSecret_0(context,
                                                                                            partialProofData))),
                            'Agent is not authorized');
    __compactRuntime.assert(amount_0 > 0n, 'Amount must be greater than zero');
    const __compact_pattern_tmp4_0 = this._getPolicy_0(context,
                                                       partialProofData,
                                                       amount_0);
    const dailyLimit_0 = __compact_pattern_tmp4_0[0];
    const perTransactionLimit_0 = __compact_pattern_tmp4_0[1];
    const spentToday_0 = __compact_pattern_tmp4_0[2];
    __compactRuntime.assert(amount_0 <= perTransactionLimit_0,
                            'Amount exceeds per-transaction limit');
    let t_0;
    __compactRuntime.assert((t_0 = spentToday_0 + amount_0, t_0 <= dailyLimit_0),
                            'Amount exceeds daily limit');
    return [];
  }
  _requestResearchSpend_0(context,
                          partialProofData,
                          amount_0,
                          recipientCommitment_0,
                          categoryCommitment_0)
  {
    __compactRuntime.assert(this._equal_9(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_7.toValue(2n),
                                                                                                                                alignment: _descriptor_7.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._persistentHash_0(this._getResearchAgentSecret_0(context,
                                                                                                partialProofData))),
                            'Agent is not authorized');
    __compactRuntime.assert(amount_0 > 0n, 'Amount must be greater than zero');
    const __compact_pattern_tmp2_0 = this._getPolicy_0(context,
                                                       partialProofData,
                                                       amount_0);
    const dailyLimit_0 = __compact_pattern_tmp2_0[0];
    const perTransactionLimit_0 = __compact_pattern_tmp2_0[1];
    const spentToday_0 = __compact_pattern_tmp2_0[2];
    __compactRuntime.assert(amount_0 <= perTransactionLimit_0,
                            'Amount exceeds per-transaction limit');
    let t_0;
    __compactRuntime.assert((t_0 = spentToday_0 + amount_0, t_0 <= dailyLimit_0),
                            'Amount exceeds daily limit');
    return [];
  }
  _requestDeveloperSpend_0(context,
                           partialProofData,
                           amount_0,
                           recipientCommitment_0,
                           categoryCommitment_0)
  {
    __compactRuntime.assert(this._equal_10(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                     partialProofData,
                                                                                                     [
                                                                                                      { dup: { n: 0 } },
                                                                                                      { idx: { cached: false,
                                                                                                               pushPath: false,
                                                                                                               path: [
                                                                                                                      { tag: 'value',
                                                                                                                        value: { value: _descriptor_7.toValue(3n),
                                                                                                                                 alignment: _descriptor_7.alignment() } }] } },
                                                                                                      { popeq: { cached: false,
                                                                                                                 result: undefined } }]).value),
                                           this._persistentHash_0(this._getDeveloperAgentSecret_0(context,
                                                                                                  partialProofData))),
                            'Agent is not authorized');
    __compactRuntime.assert(amount_0 > 0n, 'Amount must be greater than zero');
    const __compact_pattern_tmp3_0 = this._getPolicy_0(context,
                                                       partialProofData,
                                                       amount_0);
    const dailyLimit_0 = __compact_pattern_tmp3_0[0];
    const perTransactionLimit_0 = __compact_pattern_tmp3_0[1];
    const spentToday_0 = __compact_pattern_tmp3_0[2];
    __compactRuntime.assert(amount_0 <= perTransactionLimit_0,
                            'Amount exceeds per-transaction limit');
    let t_0;
    __compactRuntime.assert((t_0 = spentToday_0 + amount_0, t_0 <= dailyLimit_0),
                            'Amount exceeds daily limit');
    return [];
  }
  _requestCustomSpend_0(context,
                        partialProofData,
                        amount_0,
                        recipientCommitment_0,
                        categoryCommitment_0)
  {
    __compactRuntime.assert(this._equal_11(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                     partialProofData,
                                                                                                     [
                                                                                                      { dup: { n: 0 } },
                                                                                                      { idx: { cached: false,
                                                                                                               pushPath: false,
                                                                                                               path: [
                                                                                                                      { tag: 'value',
                                                                                                                        value: { value: _descriptor_7.toValue(4n),
                                                                                                                                 alignment: _descriptor_7.alignment() } }] } },
                                                                                                      { popeq: { cached: false,
                                                                                                                 result: undefined } }]).value),
                                           this._persistentHash_0(this._getCustomAgentSecret_0(context,
                                                                                               partialProofData))),
                            'Agent is not authorized');
    __compactRuntime.assert(amount_0 > 0n, 'Amount must be greater than zero');
    const __compact_pattern_tmp1_0 = this._getPolicy_0(context,
                                                       partialProofData,
                                                       amount_0);
    const dailyLimit_0 = __compact_pattern_tmp1_0[0];
    const perTransactionLimit_0 = __compact_pattern_tmp1_0[1];
    const spentToday_0 = __compact_pattern_tmp1_0[2];
    __compactRuntime.assert(amount_0 <= perTransactionLimit_0,
                            'Amount exceeds per-transaction limit');
    let t_0;
    __compactRuntime.assert((t_0 = spentToday_0 + amount_0, t_0 <= dailyLimit_0),
                            'Amount exceeds daily limit');
    return [];
  }
  _equal_0(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_2(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_3(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_4(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_5(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_6(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_7(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_8(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_9(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_10(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_11(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()),
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    get ownerCommitment() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_7.toValue(0n),
                                                                                                   alignment: _descriptor_7.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get taskAgentCommitment() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_7.toValue(1n),
                                                                                                   alignment: _descriptor_7.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get researchAgentCommitment() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_7.toValue(2n),
                                                                                                   alignment: _descriptor_7.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get developerAgentCommitment() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_7.toValue(3n),
                                                                                                   alignment: _descriptor_7.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    },
    get customAgentCommitment() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_7.toValue(4n),
                                                                                                   alignment: _descriptor_7.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
    }
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({
  getOwnerSecret: (...args) => undefined,
  getTaskAgentSecret: (...args) => undefined,
  getResearchAgentSecret: (...args) => undefined,
  getDeveloperAgentSecret: (...args) => undefined,
  getCustomAgentSecret: (...args) => undefined,
  getPolicy: (...args) => undefined
});
export const pureCircuits = {};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
//# sourceMappingURL=index.js.map
