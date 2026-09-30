import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { api, ApiRequestError, clearSessionToken, type Agent, type AgentType, type Proposal, type AgentTask, type Policy, type ActivityRecord, type NetworkInfo } from './api';
import { authenticateWallet, balanceAndSubmitUnboundTransaction, connectedWalletKeys, discoverWallets, type WalletState } from './wallet';

const agentMeta: Record<AgentType, { label: string; description: string; image: string }> = {
  developer: { label: 'Developer', description: 'Builds, tests, and maintains technical systems.', image: '/agents/developer.png' },
  research: { label: 'Research', description: 'Finds, compares, and distills useful information.', image: '/agents/research.png' },
  task: { label: 'Task', description: 'Handles focused, repeatable work with clear intent.', image: '/agents/task.png' },
  custom: { label: 'Custom', description: 'For an autonomous agent you have already built.', image: '/agents/custom.png' },
};

type View = 'overview' | 'agents' | 'activity' | 'settings';
const views: View[] = ['overview', 'agents', 'activity', 'settings'];

export function VouchApp() {
  const [view, setView] = useState<View | 'landing'>('landing');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState>(() => discoverWallets());
  const [notice, setNotice] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    void api.network().then(setNetworkInfo).catch((error: unknown) => {
      setNotice(error instanceof Error ? `Unable to verify the active Midnight deployment: ${error.message}` : 'Unable to verify the active Midnight deployment.');
    });
  }, []);
  useEffect(() => {
    document.documentElement.classList.add('motion-ready');
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return () => document.documentElement.classList.remove('motion-ready');
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove('motion-ready');
    };
  }, [view]);

  const refreshAgents = async () => {
    try {
      const next = await api.listAgents();
      setAgents(next);
      setSelectedId((current) => current ?? next[0]?.agentId ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to load agents.');
    }
  };
  useEffect(() => {
    if (view !== 'landing' && wallet.sessionToken) void refreshAgents();
  }, [view, wallet.sessionToken]);

  if (view === 'landing') return <Landing onLaunch={() => setView('overview')} networkInfo={networkInfo} />;
  const selected = agents.find((agent) => agent.agentId === selectedId) ?? null;
  return (
    <div className="app-shell">
      <AppNav view={view} onNavigate={setView} wallet={wallet} onWallet={setWallet} networkInfo={networkInfo} />
      <main className="app-main">
        {notice && <div className="notice" role="alert">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
        {view === 'overview' && <Overview agents={agents} selected={selected} onNavigate={setView} />}
        {view === 'agents' && <AgentsView agents={agents} selected={selected} onSelect={setSelectedId} onRefresh={refreshAgents} wallet={wallet} networkInfo={networkInfo} />}
        {view === 'activity' && <ActivityView />}
        {view === 'settings' && <SettingsView wallet={wallet} />}
      </main>
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <img className={compact ? 'logo logo-compact' : 'logo'} src="/logo/vouch-logo.png" alt="Vouch" />;
}

function Landing({ onLaunch, networkInfo }: { onLaunch: () => void; networkInfo: NetworkInfo | null }) {
  return <div className="landing">
    <div className="ambient" aria-hidden="true" />
    <header className="landing-nav"><Logo /><div className="landing-nav-right"><span className="chain-label"><i />{networkInfo?.network === 'preprod' && networkInfo.deployment ? 'Preprod contract configured' : 'Preprod configuration unavailable'}</span><button className="text-button" onClick={onLaunch}>Open app <span>↗</span></button></div></header>
    <section className="hero section-wrap">
      <p className="eyebrow hero-enter" style={{ '--enter-delay': '0ms' } as CSSProperties}>Permission infrastructure for autonomous AI agents</p>
      <h1 aria-label="You don't give your AI your wallet. You give it permission."><span className="headline-line"><span>You don't give your AI</span></span><span className="headline-line"><span>your wallet.</span></span><span className="headline-line headline-accent"><span>You give it permission.</span></span></h1>
      <p className="hero-subheadline hero-enter" style={{ '--enter-delay': '240ms' } as CSSProperties}>The AI proposes. Vouch decides. Midnight verifies.</p>
      <div className="hero-lower">
        <div className="hero-intro"><p className="hero-copy hero-enter" style={{ '--enter-delay': '360ms' } as CSSProperties}>Vouch gives agents bounded authority while your keys stay yours.</p>
          <div className="hero-actions hero-enter" style={{ '--enter-delay': '460ms' } as CSSProperties}><button className="button button-primary magnetic" onClick={onLaunch}>Open Vouch <span>↗</span></button><a className="text-link" href="#how-it-works">See how it works <span>↓</span></a></div>
          <p className="hero-proof"><span className={`status-dot ${networkInfo?.network === 'preprod' && networkInfo.deployment ? 'verified' : ''}`} />{networkInfo?.network === 'preprod' && networkInfo.deployment ? `Preprod deployment · ${networkInfo.deployment.address.slice(0, 10)}…${networkInfo.deployment.address.slice(-8)}` : 'Preprod deployment not verified'}</p>
        </div>
        <AuthorizationVisual />
      </div>
    </section>
    <TechnicalMarquee />
    <section className="section-wrap split-section problem" data-reveal><div><p className="eyebrow">The problem</p><h2>Capability is not permission.</h2></div><p>Agents can reason and act. A wallet should not have to trust every proposed action by default. Vouch adds a verifiable boundary without taking control away from you.</p></section>
    <section className="section-wrap solution" data-reveal><div className="section-heading"><p className="eyebrow">A permission layer for your wallet</p><h2>The user decides what to do.<br /><em>Vouch enforces wallet safety.</em></h2></div><FeatureBento /></section>
    <section id="how-it-works" className="section-wrap flow-section" data-reveal><div className="section-heading"><p className="eyebrow">A clear decision path</p><h2>The AI proposes. Vouch decides.<br /><em>Midnight verifies.</em></h2></div><div className="flow">{['Choose an agent', 'Review the proposal', 'Check wallet limits', 'Authorize the agent', 'Verify on Midnight'].map((step, index) => <div className="flow-step" key={step} style={{ '--stagger': `${index * 90}ms` } as CSSProperties}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong></div>)}</div></section>
    <section className="section-wrap privacy" data-reveal><div className="privacy-mark" aria-hidden="true">V</div><div><p className="eyebrow">Designed for privacy</p><h2>Prove the permission.<br />Keep the details private.</h2><p>Agent identity and private policy state are checked through Compact circuits. Recipient and category describe the requested action; wallet safety comes from authorization and spending limits.</p><button className="text-link" onClick={onLaunch}>Explore the product <span>↗</span></button></div></section>
    <section className="section-wrap agents-landing" data-reveal><div className="section-heading"><p className="eyebrow">Built for different kinds of work</p><h2>One boundary. Your agents.</h2></div><div className="agent-grid">{(Object.keys(agentMeta) as AgentType[]).map((type, index) => <AgentPresentation key={type} type={type} index={index} />)}</div></section>
    <section className="final-cta section-wrap" data-reveal><p className="eyebrow">Your wallet. Your authority.</p><h2>Give your agents permission to act.<br /><em>Keep the authority yours.</em></h2><button className="button button-primary magnetic" onClick={onLaunch}>Launch Vouch <span>↗</span></button></section>
    <footer className="landing-footer"><Logo compact /><span>Permission to act.</span></footer>
  </div>;
}

function AuthorizationVisual() {
  return <div className="authorization-visual hero-enter" style={{ '--enter-delay': '530ms' } as CSSProperties} aria-label="AI Agent proposes, Vouch checks permission, Midnight verifies privately">
    <div className="visual-topline"><span>ARCHITECTURE PIPELINE</span><span className="visual-online"><i /> MIDNIGHT PREPROD</span></div>
    <div className="visual-node agent-node"><span className="node-icon">01</span><span><small>AGENT</small><strong>Proposes spend or action</strong></span><span className="node-tag">Proposes</span></div>
    <div className="signal-track"><div className="signal-line" /><i className="gold-signal" /></div>
    <div className="visual-node vouch-node"><span className="node-icon gold">02</span><span><small>VOUCH</small><strong>Evaluates spending policy</strong></span><span className="node-tag verified">Decides</span></div>
    <div className="signal-track signal-second"><div className="signal-line" /><i className="gold-signal delayed" /></div>
    <div className="visual-node midnight-node"><span className="node-icon">03</span><span><small>MIDNIGHT</small><strong>Verifies ZK proof on-chain</strong></span><span className="node-tag verified">Verifies</span></div>
    <div className="visual-foot"><span><i className="status-dot verified" /> ZERO-KNOWLEDGE PROOF</span><span>NO WALLET KEYS SHARED</span></div>
  </div>;
}

function TechnicalMarquee() {
  const terms = ['PRIVATE AUTHORIZATION', 'AGENT IDENTITY', 'SPENDING LIMITS', 'ZERO-KNOWLEDGE', 'MIDNIGHT PREPROD', 'PRIVATE POLICY'];
  return <div className="marquee" aria-label={terms.join(' · ')}><div className="marquee-track" aria-hidden="true">{[0, 1].map((copy) => <span className="marquee-group" key={copy}>{terms.map((term) => <span className="marquee-item" key={`${copy}-${term}`}>{term}<i>·</i></span>)}</span>)}</div></div>;
}

function FeatureBento() {
  const cards = [
    { number: '01', title: 'Agent identity', text: 'Each agent type has a distinct identity, separately authorized by the wallet owner.', icon: 'ID', className: 'bento-identity' },
    { number: '02', title: 'Spending limits', text: 'Every spend is checked against a per-transaction cap and a daily limit.', icon: '≤', className: 'bento-limits' },
    { number: '03', title: 'Private policy', text: 'Sensitive authorization values are supplied as private witnesses to Compact circuits.', icon: '◈', className: 'bento-private' },
    { number: '04', title: 'Midnight verification', text: 'The real authorization request is proved and submitted to the configured Preprod contract.', icon: '✓', className: 'bento-midnight' },
  ];
  return <div className="bento-grid">{cards.map((card, index) => <article className={`bento-card ${card.className}`} key={card.number} data-reveal style={{ '--stagger': `${index * 100}ms` } as CSSProperties}><div className="bento-card-top"><span>{card.number} / SAFETY LAYER</span><span className="bento-icon">{card.icon}</span></div><div><h3>{card.title}</h3><p>{card.text}</p></div></article>)}</div>;
}

function AgentPresentation({ type, index }: { type: AgentType; index: number }) {
  const meta = agentMeta[type];
  return <article className="agent-presentation" data-reveal style={{ '--stagger': `${index * 100}ms` } as CSSProperties}><span className={`agent-glyph glyph-${type}`}>{meta.label.slice(0, 1)}</span><div><h3>{meta.label} agent</h3><p>{meta.description}</p></div><span className="arrow">↗</span></article>;
}

function AppNav({ view, onNavigate, wallet, onWallet, networkInfo }: { view: View; onNavigate: (view: View) => void; wallet: WalletState; onWallet: (state: WalletState) => void; networkInfo: NetworkInfo | null }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(wallet.wallets[0]?.id ?? null);
  const connect = async () => {
    if (!wallet.manager) {
      const discovered = discoverWallets();
      onWallet(discovered);
      if (!discovered.manager || discovered.wallets.length === 0) return;
      setSelectedWalletId(discovered.wallets[0]?.id ?? null);
      return;
    }
    const chosen = wallet.wallets.find((candidate) => candidate.id === selectedWalletId) ?? wallet.wallets[0];
    if (!chosen) {
      onWallet({ ...wallet, error: 'No compatible Midnight wallet detected. Install Lace or another Midnight DApp Connector wallet, then reload this page.' });
      return;
    }
    const selected = wallet.manager.selectWallet(chosen.id);
    if (!selected.ok) { onWallet({ ...wallet, error: selected.error.message }); return; }
    onWallet({ ...wallet, status: 'connecting', error: null });
    const result = await wallet.manager.connectSelectedWallet();
    if (!result.ok) { clearSessionToken(); onWallet({ ...wallet, status: 'disconnected', sessionToken: null, userId: null, error: result.error.message }); return; }
    try {
      const address = result.value.api ? (await result.value.api.getUnshieldedAddress()).unshieldedAddress : null;
      const session = await authenticateWallet(result.value);
      onWallet({ ...wallet, connection: result.value, sessionToken: session.token, userId: session.userId, address, status: 'authenticated', error: null });
    } catch (error) {
      clearSessionToken();
      onWallet({ ...wallet, connection: result.value, sessionToken: null, userId: null, address: null, status: 'connected', error: error instanceof Error ? error.message : 'Wallet authentication failed.' });
    }
  };
  const label = wallet.status === 'authenticated' ? `Authenticated · ${wallet.address ? `${wallet.address.slice(0, 8)}…${wallet.address.slice(-6)}` : wallet.connection?.walletName}` : wallet.status === 'connected' ? 'Connected · authenticate' : wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet';
  const deployment = networkInfo?.network === 'preprod' ? networkInfo.deployment : null;
  const hasProvider = wallet.wallets.length > 0;
  return <header className="app-nav"><button className="brand-button" onClick={() => { setMobileMenuOpen(false); onNavigate('overview'); }}><Logo /></button><nav className={mobileMenuOpen ? 'app-nav-menu is-open' : 'app-nav-menu'} aria-label="Main navigation">{views.map((item) => <button key={item} className={view === item ? 'nav-link active' : 'nav-link'} onClick={() => { onNavigate(item); setMobileMenuOpen(false); }}>{item}</button>)}</nav><div className="nav-right"><span className={`deployment-badge ${deployment ? 'deployment-ready' : ''}`} title={deployment ? `Contract ${deployment.address}` : 'Preprod deployment could not be verified'}><i />{deployment ? `Preprod · ${deployment.address.slice(0, 8)}…` : 'Deployment unavailable'}</span>{wallet.wallets.length > 1 && !wallet.connection && <select aria-label="Select Midnight wallet" value={selectedWalletId ?? ''} onChange={(event) => setSelectedWalletId(event.target.value)}>{wallet.wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button className="button button-small wallet-status" onClick={() => void connect()} disabled={wallet.status === 'connecting'}><span className={`status-dot ${wallet.status}`} />{label}</button><button className="mobile-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? 'Close' : 'Menu'}</button></div>{!hasProvider && !wallet.connection && <div className="wallet-provider-help" role="status"><span>No compatible Midnight wallet detected.</span><a href="https://www.lace.io/" target="_blank" rel="noreferrer">Install Lace</a><button onClick={() => onWallet(discoverWallets())}>Check again</button></div>}{wallet.error && <div className="wallet-provider-error" role="alert">{wallet.error}</div>}</header>;
}
function Overview({ agents, selected, onNavigate }: { agents: Agent[]; selected: Agent | null; onNavigate: (view: View) => void }) {
  const active = agents.filter((agent) => agent.status === 'active').length;
  return <div className="page"><PageIntro eyebrow="Overview" title="A calm place to give permission." description="The AI proposes the action. Vouch decides whether it is authorized." /><div className="overview-grid"><div className="feature-panel"><div className="panel-label">Selected agent</div>{selected ? <><div className="selected-agent"><img src={agentMeta[selected.type].image} alt="" /><div><h2>{selected.name}</h2><span>{agentMeta[selected.type].label} · {selected.status}</span></div></div><div className="panel-divider" /><div className="authority-note"><span className="status-dot" />{selected.authorization.status === 'authorized' ? 'Authorization is configured' : 'Authorization not configured'}<small>Application state does not replace Midnight verification.</small></div></> : <EmptyState title="No agents yet." description="Create an agent to start defining bounded authority." action="Create your first agent" onAction={() => onNavigate('agents')} />}</div><div className="stat-panel"><div><span className="panel-label">Agents</span><strong>{agents.length}</strong><small>{active} active</small></div><div><span className="panel-label">Wallet</span><strong className="stat-word">{'Not connected'}</strong><small>Connect a Midnight wallet to continue</small></div></div></div><section className="lower-section"><div className="section-title"><h2>Recent activity</h2><button className="text-button" onClick={() => onNavigate('activity')}>View all →</button></div><EmptyState title="No activity yet." description="Agent proposals and authorization events will appear here when they happen." /></section></div>;
}

function AgentsView({ agents, selected, onSelect, onRefresh, wallet, networkInfo }: { agents: Agent[]; selected: Agent | null; onSelect: (id: string) => void; onRefresh: () => Promise<void>; wallet: WalletState; networkInfo: NetworkInfo | null }) {
  const [creating, setCreating] = useState(false);
  return <div className="page"><PageIntro eyebrow="Agents" title="Permission, made personal." description="Vouch controls how much this agent can spend, not what you choose to buy." action={<button className="button button-dark" onClick={() => setCreating(true)}>Add an agent <span>+</span></button>} />{networkInfo?.execution === 'unavailable' && <p className="execution-status-note" role="status">Agent management remains available. Midnight transaction building is unavailable{networkInfo?.executionError ? `: ${networkInfo.executionError}` : '.'}</p>}{creating && <CreateAgent onCreated={async () => { setCreating(false); await onRefresh(); }} onCancel={() => setCreating(false)} />}{!creating && (agents.length ? <><div className="managed-agents">{agents.map((agent) => <AgentCard key={agent.agentId} agent={agent} selected={selected?.agentId === agent.agentId} onSelect={() => onSelect(agent.agentId)} onRefresh={onRefresh} />)}</div>{selected && <AgentWorkspace key={selected.agentId} agent={selected} onRefresh={onRefresh} wallet={wallet} networkInfo={networkInfo} />}</> : <div className="wide-empty"><EmptyState title="No agents yet." description="Your first agent is the start of a more intentional way to delegate." action="Create an agent" onAction={() => setCreating(true)} /></div>)}</div>;
}

function AgentWorkspace({ agent, onRefresh, wallet, networkInfo }: { agent: Agent; onRefresh: () => Promise<void>; wallet: WalletState; networkInfo: NetworkInfo | null }) {
  const [task, setTask] = useState('Find the most useful option for this task.');
  const [taskKind, setTaskKind] = useState<'spend' | 'observe'>('spend');
  const [spend, setSpend] = useState({ amount: '', recipient: '', category: '', reason: '' });
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [state, setState] = useState<'idle' | 'proposal-pending' | 'policy-checking' | 'policy-approved' | 'transaction-pending' | 'transaction-confirmed' | 'rejected' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const [policy, setPolicy] = useState<Policy>({ dailyLimit: '100', perTransactionLimit: '25' });
  const [policyMessage, setPolicyMessage] = useState('');
  const [authorizationMessage, setAuthorizationMessage] = useState('');
  const [authorizationTransactionId, setAuthorizationTransactionId] = useState<string | null>(null);
  const [executionTransactionId, setExecutionTransactionId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api.policy(agent.agentId).then((saved) => { if (active) setPolicy(saved); }).catch((error: unknown) => {
      if (active) setPolicyMessage(error instanceof Error ? error.message : 'Could not load the current agent policy.');
    });
    return () => { active = false; };
  }, [agent.agentId]);
  const run = async (event: FormEvent) => {
    event.preventDefault();
    setProposal(null);
    setExecutionTransactionId(null);
    setState('proposal-pending'); setMessage('Agent is preparing a proposal.');
    try {
      const input: AgentTask = taskKind === 'spend'
        ? { action: 'spend', ...spend, reason: spend.reason || task }
        : { action: 'observe', subject: task };
      const next = await api.propose(agent.agentId, input);
      setProposal(next);
      setState('policy-checking'); setMessage('Vouch is checking the proposal against this agent’s authorization and spending limits.');
      const result = await api.checkAuthorization(next);
      if (result.decision === 'allowed') { setState('policy-approved'); setMessage(result.reason); }
      else { setState('rejected'); setMessage(result.reason); }
    } catch (error) {
      setState(error instanceof ApiRequestError && (error.statusCode === 400 || error.statusCode === 403) ? 'rejected' : 'failed');
      setMessage(error instanceof Error ? error.message : 'The agent could not produce a proposal.');
    }
  };
  const busy = state === 'proposal-pending' || state === 'policy-checking' || state === 'transaction-pending';
  const execute = async () => {
    if (!proposal || state !== 'policy-approved') return;
    if (!wallet.connection) {
      setState('failed');
      setMessage('Connect a Midnight wallet before submitting the transaction.');
      return;
    }
    setState('transaction-pending'); setMessage('Building the transaction; your wallet will ask you to approve it…'); setExecutionTransactionId(null);
    try {
      // Browser-wallet split: the backend builds and proves the unbound
      // transaction; the connected wallet balances, signs, and submits it.
      // The spend flow keeps its two-transaction shape: the first (authorize)
      // transaction confirms, then the backend hands over the request*Spend
      // transaction for a second wallet approval.
      const walletKeys = await connectedWalletKeys(wallet.connection);
      let current: Awaited<ReturnType<typeof api.execute>> | Awaited<ReturnType<typeof api.confirmExecute>> = await api.execute(proposal, walletKeys);
      while (current.status === 'pending-transaction') {
        const submitted = await balanceAndSubmitUnboundTransaction(wallet.connection, current.pendingTransaction.unboundTxHex);
        current = await api.confirmExecute({ pendingTransactionId: current.pendingTransaction.pendingTransactionId, transactionId: submitted });
      }
      if (current.status !== 'confirmed') throw new Error('Midnight execution did not confirm.');
      setExecutionTransactionId(current.transactionId);
      setState('transaction-confirmed'); setMessage(`Midnight confirmed this transaction at ${current.contractAddress}.`);
    } catch (error) { setState('failed'); setMessage(error instanceof Error ? error.message : 'Midnight execution failed.'); }
  };
  const savePolicy = async (event: FormEvent) => {
    event.preventDefault();
    setPolicyMessage('Saving wallet-safety limits…');
    try {
      const saved = await api.savePolicy(agent.agentId, policy);
      setPolicy(saved);
      setPolicyMessage('Wallet-safety limits saved for this agent.');
    } catch (error) {
      setPolicyMessage(error instanceof Error ? error.message : 'Unable to save the agent policy.');
    }
  };
  const authorize = async () => {
    if (wallet.status !== 'authenticated' || !wallet.connection) {
      setAuthorizationMessage('Connect and authenticate a Midnight wallet before authorizing this agent.');
      return;
    }
    setAuthorizationTransactionId(null);
    setAuthorizationMessage('Building the authorization transaction; your wallet will ask you to approve it…');
    try {
      // Browser-wallet split: the backend builds and proves the unbound
      // transaction; the connected wallet balances, signs, and submits it.
      const walletKeys = await connectedWalletKeys(wallet.connection);
      const started = await api.authorize(agent.agentId, walletKeys);
      if (started.status !== 'pending-transaction') throw new Error('The server did not return a transaction to approve.');
      const transactionId = await balanceAndSubmitUnboundTransaction(wallet.connection, started.pendingTransaction.unboundTxHex);
      const result = await api.confirmAuthorize(agent.agentId, { pendingTransactionId: started.pendingTransaction.pendingTransactionId, transactionId });
      setAuthorizationTransactionId(result.transactionId);
      setAuthorizationMessage('Authorization transaction confirmed. Agent status updated.');
      await onRefresh();
    } catch (error) {
      setAuthorizationMessage(error instanceof Error ? error.message : 'Midnight agent authorization failed.');
    }
  };
  const stateLabel = {
    idle: 'Ready',
    'proposal-pending': 'Agent proposing',
    'policy-checking': 'Checking policy',
    'policy-approved': 'Policy approved',
    'transaction-pending': 'Transaction pending',
    'transaction-confirmed': 'Transaction confirmed',
    rejected: 'Rejected',
    failed: 'Failed',
  }[state];
  return <section className="workspace-panel">
    <div className="section-title"><div><p className="eyebrow">Selected agent · {agentMeta[agent.type].label}</p><h2>{agent.name}</h2><span className="workspace-note">{agent.status} · {agent.authorization.status === 'authorized' ? 'authorized' : 'not authorized'}</span></div><span className="workspace-note">Midnight Preprod</span></div>
    <div className="wallet-state-note"><span className={`status-dot ${wallet.status === 'authenticated' ? 'verified' : ''}`} />{wallet.status === 'authenticated' ? `User wallet authenticated: ${wallet.address ? `${wallet.address.slice(0, 10)}…${wallet.address.slice(-6)}` : wallet.connection?.walletName}.` : wallet.wallets.length ? 'Connect a compatible Midnight wallet to authenticate.' : 'No compatible Midnight wallet detected.'}<small>Vouch builds and proves each transaction; this connected wallet balances, signs, and submits it. Approvals appear in your wallet.</small></div>
    <form className="policy-editor" onSubmit={savePolicy}><div><span className="panel-label">Spending safety</span><p className="field-hint">Vouch controls how much this agent can spend, not what you choose to buy.</p></div><label>Daily spending limit<input className="input" inputMode="numeric" value={policy.dailyLimit} onChange={(event) => setPolicy({ ...policy, dailyLimit: event.target.value })} aria-label="Daily spending limit" placeholder="100" /></label><label>Maximum per transaction<input className="input" inputMode="numeric" value={policy.perTransactionLimit} onChange={(event) => setPolicy({ ...policy, perTransactionLimit: event.target.value })} aria-label="Maximum per transaction" placeholder="25" /></label><button className="button button-quiet">Save policy</button>{policyMessage && <small className="field-hint">{policyMessage}</small>}</form>
    {agent.authorization.status === 'authorized'
      ? <div className="authorization-state"><span className="status-dot verified" />Agent authorized</div>
      : <div className="authorization-action"><button className="button button-dark" disabled={authorizationMessage.startsWith('Building the authorization transaction') || wallet.status !== 'authenticated'} onClick={() => void authorize()}>{authorizationMessage.startsWith('Building the authorization transaction') ? 'Authorizing…' : 'Authorize agent'}</button><span>{authorizationMessage || (wallet.status !== 'authenticated' ? 'Connect and authenticate a Midnight wallet to continue.' : 'Submitting requires one approval in your Midnight wallet.')}</span></div>}
    {authorizationTransactionId && <TransactionReference transactionId={authorizationTransactionId} label="Agent authorization transaction" />}
    <form className="workspace-form" onSubmit={run}><select className="input" value={taskKind} onChange={(event) => setTaskKind(event.target.value as 'spend' | 'observe')} aria-label="Proposal type"><option value="spend">Propose a spend</option><option value="observe">Propose an observation</option></select>{taskKind === 'spend' ? <><input className="input" required inputMode="numeric" value={spend.amount} onChange={(event) => setSpend({ ...spend, amount: event.target.value })} placeholder="Amount (whole tNIGHT units)" aria-label="Proposal amount" /><input className="input" required value={spend.recipient} onChange={(event) => setSpend({ ...spend, recipient: event.target.value })} placeholder="Recipient" aria-label="Proposal recipient" /><input className="input" required value={spend.category} onChange={(event) => setSpend({ ...spend, category: event.target.value })} placeholder="Category" aria-label="Proposal category" /><input className="input" required value={spend.reason} onChange={(event) => setSpend({ ...spend, reason: event.target.value })} placeholder="Reason" aria-label="Proposal reason" /></> : <input className="input" required value={task} onChange={(event) => setTask(event.target.value)} aria-label="Observation task" placeholder="Observation task" />}<button className="button button-dark" disabled={busy || agent.status !== 'active' || agent.authorization.status !== 'authorized' || wallet.status !== 'authenticated'}>{busy ? 'Checking…' : 'Ask agent to propose'}</button></form>
    {agent.status !== 'active' && <p className="field-hint">Activate this agent before asking it to work.</p>}
    {proposal && <div className="proposal-card"><div className="proposal-head"><span className="panel-label">Proposal from {agent.name}</span><span className={`proposal-state ${state}`}>{stateLabel}</span></div><div className="proposal-content"><strong>{proposal.action === 'spend' ? `Amount: ${proposal.amount ?? ''}` : 'Observation'}</strong><p>Agent: {agent.name}</p>{proposal.action === 'spend' && <><p>Recipient: {proposal.recipient}</p><p>Category: {proposal.category}</p></>}<small>{proposal.reason ?? proposal.subject}</small></div>{message && <div className="proposal-message">{message}</div>}{state === 'policy-approved' && <button className="button button-dark" onClick={() => void execute()}>Submit approved transaction →</button>}{state === 'transaction-pending' && <p className="transaction-pending">Approve the transaction in your wallet; Midnight Preprod confirmation follows…</p>}{executionTransactionId && <TransactionReference transactionId={executionTransactionId} label="Confirmed Midnight transaction" />}</div>}
  </section>;
}

function TransactionReference({ transactionId, label }: { transactionId: string; label: string }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transactionId);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };
  return <div className="transaction-reference"><span className="panel-label">{label}</span><code title={transactionId}>{transactionId}</code><button className="copy-transaction" onClick={() => void copy()}>{copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy unavailable' : 'Copy ID'}</button></div>;
}

function CreateAgent({ onCreated, onCancel }: { onCreated: () => Promise<void>; onCancel: () => void }) {
  const [type, setType] = useState<AgentType>('developer'); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { await api.createAgent({ name, type }); await onCreated(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create agent.'); } finally { setBusy(false); } };
  return <form className="create-flow" onSubmit={submit}><div className="flow-head"><div><p className="eyebrow">New agent</p><h2>Choose who will act.</h2></div><button type="button" className="close-button" onClick={onCancel} aria-label="Cancel">×</button></div><div className="type-options">{(Object.keys(agentMeta) as AgentType[]).map((option) => <button type="button" key={option} className={type === option ? 'type-option selected' : 'type-option'} onClick={() => setType(option)}><img src={agentMeta[option].image} alt="" /><strong>{agentMeta[option].label}</strong><span>{agentMeta[option].description}</span></button>)}</div><label className="field-label" htmlFor="agent-name">Give your agent a name</label><input id="agent-name" className="input" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Studio Researcher" />{type === 'custom' && <p className="field-hint">Custom is for developers who already have an autonomous agent they built themselves. It does not connect ChatGPT or Claude for you.</p>}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-dark" disabled={busy}>{busy ? 'Creating…' : 'Create agent →'}</button></div></form>;
}

function AgentCard({ agent, selected, onSelect, onRefresh }: { agent: Agent; selected: boolean; onSelect: () => void; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(agent.name);
  const [credential, setCredential] = useState<string | null>(null);
  const [credentialMessage, setCredentialMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const mutate = async (action: 'activate' | 'deactivate' | 'revoke') => {
    if (action === 'revoke' && !window.confirm('Revoke this agent? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.lifecycle(agent.agentId, action);
      await onRefresh();
    } catch (error) {
      setCredentialMessage(error instanceof Error ? error.message : 'Unable to update agent status.');
    } finally {
      setBusy(false);
    }
  };
  const rename = async () => {
    setBusy(true);
    try {
      await api.renameAgent(agent.agentId, name);
      setRenaming(false);
      await onRefresh();
    } catch (error) {
      setCredentialMessage(error instanceof Error ? error.message : 'Unable to rename agent.');
    } finally {
      setBusy(false);
    }
  };
  const issueCredential = async () => {
    setBusy(true);
    setCredentialMessage('');
    try {
      const result = await api.issueAgentCredential(agent.agentId);
      setCredential(result.credential);
      setCopied(false);
      setCredentialMessage('This credential is shown once. Copy it directly to your Custom Agent configuration.');
    } catch (error) {
      setCredentialMessage(error instanceof Error ? error.message : 'Unable to issue a Custom Agent credential.');
    } finally {
      setBusy(false);
    }
  };
  const copyCredential = async () => {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential);
      setCopied(true);
    } catch {
      setCredentialMessage('Clipboard access is unavailable. Copy the credential manually before closing this view.');
    }
  };
  const meta = agentMeta[agent.type];
  return <article className={selected ? 'managed-agent selected' : 'managed-agent'} onClick={onSelect}>
    <div className="managed-agent-main"><img src={meta.image} alt={`${meta.label} agent`} /><div><span className="agent-type">{meta.label} agent</span>{renaming ? <input className="inline-input" value={name} onChange={(event) => setName(event.target.value)} onClick={(event) => event.stopPropagation()} /> : <h2>{agent.name}</h2>}<div className="agent-status"><span className={`status-dot ${agent.status}`} />{agent.status}<span className="status-separator">·</span>{agent.authorization.status === 'authorized' ? 'Authorized' : 'Not authorized'}</div></div></div>
    <div className="managed-agent-actions">{renaming ? <button className="text-button" disabled={busy} onClick={(event) => { event.stopPropagation(); void rename(); }}>Save</button> : <button className="text-button" onClick={(event) => { event.stopPropagation(); setRenaming(true); }}>Rename</button>}{agent.type === 'custom' && <button className="text-button" disabled={busy} onClick={(event) => { event.stopPropagation(); void issueCredential(); }}>Connect Custom Agent</button>}{agent.status !== 'revoked' && <button className="text-button" disabled={busy} onClick={(event) => { event.stopPropagation(); void mutate(agent.status === 'active' ? 'deactivate' : 'activate'); }}>{agent.status === 'active' ? 'Deactivate' : 'Activate'}</button>}{agent.status !== 'revoked' && <button className="text-button danger" disabled={busy} onClick={(event) => { event.stopPropagation(); void mutate('revoke'); }}>Revoke</button>}</div>
    {credential && <div className="agent-credential" onClick={(event) => event.stopPropagation()}><strong>One-time agent credential</strong><code>{credential}</code><p>Configure your agent to connect to <code>/api/custom-agent/connect</code> using its agent ID and this credential. The connection returns a one-hour scoped token for <code>/api/custom-agent/propose</code>. Never give it your wallet keys.</p><button className="button button-quiet" onClick={() => void copyCredential()}>{copied ? 'Copied' : 'Copy credential'}</button><button className="text-button" onClick={() => setCredential(null)}>Hide credential</button></div>}
    {credentialMessage && <p className="agent-card-message" role="status">{credentialMessage}</p>}
  </article>;
}

function ActivityView() { const [items, setItems] = useState<ActivityRecord[]>([]); const [agentId, setAgentId] = useState(''); useEffect(() => { void api.listAgents().then((list) => { const id = list[0]?.agentId; if (id) { setAgentId(id); return api.activity(id).then(setItems); } return undefined; }).catch(() => undefined); }, []); return <div className="page"><PageIntro eyebrow="Activity" title="A record of what happened." description="Activity is loaded from the authenticated Vouch API." />{items.length ? <div className="activity-list">{items.map((item) => <article className="activity-row" key={item.id}><div><strong>{item.event}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></div>{item.transactionId && <code>{item.transactionId}</code>}</article>)}</div> : <div className="wide-empty"><EmptyState title={agentId ? 'No activity yet.' : 'Select an agent first.'} description="Real proposals, policy decisions, and Midnight transaction IDs will appear here." /></div>}</div>; }
function SettingsView({ wallet }: { wallet: WalletState }) { return <div className="page"><PageIntro eyebrow="Settings" title="Keep the essentials clear." description="Settings will appear here as the application gains supported preferences." /><div className="settings-list"><div><span>Wallet connection</span><strong>{wallet.connection ? wallet.connection.walletName : 'Not connected'}</strong></div><div><span>Network</span><strong>{wallet.connection?.networkId ?? 'No active connection'}</strong></div><div><span>Authorization</span><strong>Midnight remains authoritative</strong></div></div>{wallet.error && <div className="notice" role="alert">{wallet.error}</div>}</div>; }
function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function EmptyState({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) { return <div className="empty-state"><div className="empty-mark">V</div><h2>{title}</h2><p>{description}</p>{action && onAction && <button className="button button-dark" onClick={onAction}>{action} <span>→</span></button>}</div>; }
