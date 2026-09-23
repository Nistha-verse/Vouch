import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, type Agent, type AgentType, type Proposal, type AgentTask, type Policy, type ActivityRecord } from './api';
import { authenticateWallet, discoverWallets, type WalletState } from './wallet';

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

  if (view === 'landing') return <Landing onLaunch={() => setView('overview')} />;
  const selected = agents.find((agent) => agent.agentId === selectedId) ?? null;
  return (
    <div className="app-shell">
      <AppNav view={view} onNavigate={setView} wallet={wallet} onWallet={setWallet} />
      <main className="app-main">
        {notice && <div className="notice" role="alert">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
        {view === 'overview' && <Overview agents={agents} selected={selected} onNavigate={setView} />}
        {view === 'agents' && <AgentsView agents={agents} selected={selected} onSelect={setSelectedId} onRefresh={refreshAgents} />}
        {view === 'activity' && <ActivityView />}
        {view === 'settings' && <SettingsView wallet={wallet} />}
      </main>
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <img className={compact ? 'logo logo-compact' : 'logo'} src="/logo/vouch-logo.png" alt="Vouch" />;
}

function Landing({ onLaunch }: { onLaunch: () => void }) {
  return <div className="landing">
    <header className="landing-nav"><Logo /><button className="text-button" onClick={onLaunch}>Open app <span>↗</span></button></header>
    <section className="hero section-wrap">
      <p className="eyebrow">Bounded authority for autonomous agents</p>
      <h1>You don't give your AI your wallet.<br /><em>You give it permission.</em></h1>
      <p className="hero-copy">Vouch gives autonomous agents permission to do useful work without handing them unrestricted access to your wallet.</p>
      <div className="hero-actions"><button className="button button-dark" onClick={onLaunch}>Launch Vouch <span>→</span></button><a className="button button-quiet" href="#how-it-works">See how it works <span>↓</span></a></div>
      <div className="hero-flow" aria-label="AI proposes, Vouch decides, Midnight verifies authorization privately">
        {['AI proposes', 'Vouch evaluates permission', 'Midnight verifies privately'].map((label, index) => <div className="hero-flow-stage" key={label}><span>0{index + 1}</span><strong>{label}</strong>{index < 2 && <i aria-hidden="true">→</i>}</div>)}
      </div>
      <div className="hero-rule"><span>AI proposes</span><span className="rule-line" /><span>Vouch decides</span></div>
    </section>
    <section className="section-wrap split-section problem"><div><p className="eyebrow">The problem</p><h2>AI agents can act.<br />But what should they be allowed to do?</h2></div><p>Autonomous systems are becoming capable of making decisions and taking action. Giving one direct access to a wallet asks for trust where a clear boundary would be better.</p></section>
    <section className="section-wrap solution"><div className="section-heading"><p className="eyebrow">The Vouch approach</p><h2>You define the permission.<br /><em>Vouch enforces it.</em></h2></div><PolicyCard /></section>
    <section id="how-it-works" className="section-wrap flow-section"><div className="section-heading"><p className="eyebrow">How it works</p><h2>The AI proposes. Vouch decides.<br /><em>Midnight verifies.</em></h2></div><div className="flow">{['AI proposal', 'Vouch policy', 'User approval', 'Midnight proof', 'Authorized or rejected'].map((step, index) => <div className="flow-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>{index < 4 && <i>↓</i>}</div>)}</div></section>
    <section className="section-wrap privacy"><div className="privacy-mark">V</div><div><p className="eyebrow">Designed for privacy</p><h2>Verify permission<br />without oversharing.</h2><p>Vouch keeps the sensitive authorization layer separate from the agent’s proposal. The application can explain what is happening; Midnight remains authoritative for protected policy state and final verification.</p></div></section>
    <section className="section-wrap agents-landing"><div className="section-heading"><p className="eyebrow">The cast</p><h2>Meet your agents.</h2></div><div className="agent-grid">{(Object.keys(agentMeta) as AgentType[]).map((type) => <AgentPresentation key={type} type={type} />)}</div></section>
    <section className="final-cta section-wrap"><p className="eyebrow">Your authority, clearly kept</p><h2>Give your agents permission to act.<br /><em>Keep the authority yours.</em></h2><button className="button button-dark" onClick={onLaunch}>Launch Vouch <span>→</span></button></section>
    <footer className="landing-footer"><Logo compact /><span>Permission to act.</span></footer>
  </div>;
}

function PolicyCard() {
  return <div className="policy-card"><div className="policy-card-top"><span className="status-dot" /> Authority profile <span className="muted">Application policy</span></div><div className="policy-agent"><img src={agentMeta.research.image} alt="" /><div><strong>Research agent</strong><span>Bounded authority</span></div><span className="pill">Active</span></div><div className="policy-lines"><div><span>Daily limit</span><b>Configured by you</b></div><div><span>Per transaction</span><b>Configured by you</b></div><div><span>Categories</span><b>Allowed list</b></div><div><span>Recipients</span><b>Allowed list</b></div></div><small>Policy details are shown when available from the connected application.</small></div>;
}

function AgentPresentation({ type }: { type: AgentType }) {
  const meta = agentMeta[type];
  return <article className="agent-presentation"><img src={meta.image} alt={`${meta.label} agent`} /><div><h3>{meta.label}</h3><p>{meta.description}</p></div><span className="arrow">↗</span></article>;
}

function AppNav({ view, onNavigate, wallet, onWallet }: { view: View; onNavigate: (view: View) => void; wallet: WalletState; onWallet: (state: WalletState) => void }) {
  const connect = async () => {
    if (!wallet.manager) { onWallet(discoverWallets()); return; }
    const chosen = wallet.wallets[0];
    if (!chosen) return;
    const selected = wallet.manager.selectWallet(chosen.id);
    if (!selected.ok) { onWallet({ ...wallet, error: selected.error.message }); return; }
    onWallet({ ...wallet, status: 'connecting', error: null });
    const result = await wallet.manager.connectSelectedWallet();
    if (!result.ok) { onWallet({ ...wallet, status: 'disconnected', error: result.error.message }); return; }
    try {
      const address = result.value.api ? (await result.value.api.getUnshieldedAddress()).unshieldedAddress : null;
      const session = await authenticateWallet(result.value);
      onWallet({ ...wallet, connection: result.value, sessionToken: session.token, userId: session.userId, address, status: 'authenticated', error: null });
    } catch (error) {
      onWallet({ ...wallet, connection: result.value, sessionToken: null, userId: null, address: null, status: 'connected', error: error instanceof Error ? error.message : 'Wallet authentication failed.' });
    }
  };
  const label = wallet.status === 'authenticated' ? `Authenticated · ${wallet.address ? `${wallet.address.slice(0, 8)}…${wallet.address.slice(-6)}` : wallet.connection?.walletName}` : wallet.status === 'connected' ? 'Connected · authenticate' : wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet';
  return <header className="app-nav"><button className="brand-button" onClick={() => onNavigate('overview')}><Logo /></button><nav aria-label="Main navigation">{views.map((item) => <button key={item} className={view === item ? 'nav-link active' : 'nav-link'} onClick={() => onNavigate(item)}>{item}</button>)}</nav><div className="nav-right"><button className="button button-small wallet-status" onClick={connect} disabled={wallet.status === 'connecting'}><span className={`status-dot ${wallet.status}`} />{label}</button><span className="preview-label">Preview</span></div></header>;
}
function Overview({ agents, selected, onNavigate }: { agents: Agent[]; selected: Agent | null; onNavigate: (view: View) => void }) {
  const active = agents.filter((agent) => agent.status === 'active').length;
  return <div className="page"><PageIntro eyebrow="Overview" title="A calm place to give permission." description="The AI proposes the action. Vouch decides whether it is authorized." /><div className="overview-grid"><div className="feature-panel"><div className="panel-label">Selected agent</div>{selected ? <><div className="selected-agent"><img src={agentMeta[selected.type].image} alt="" /><div><h2>{selected.name}</h2><span>{agentMeta[selected.type].label} · {selected.status}</span></div></div><div className="panel-divider" /><div className="authority-note"><span className="status-dot" />{selected.authorization.status === 'authorized' ? 'Authorization is configured' : 'Authorization not configured'}<small>Application state does not replace Midnight verification.</small></div></> : <EmptyState title="No agents yet." description="Create an agent to start defining bounded authority." action="Create your first agent" onAction={() => onNavigate('agents')} />}</div><div className="stat-panel"><div><span className="panel-label">Agents</span><strong>{agents.length}</strong><small>{active} active</small></div><div><span className="panel-label">Wallet</span><strong className="stat-word">{'Not connected'}</strong><small>Connect a Midnight wallet to continue</small></div></div></div><section className="lower-section"><div className="section-title"><h2>Recent activity</h2><button className="text-button" onClick={() => onNavigate('activity')}>View all →</button></div><EmptyState title="No activity yet." description="Agent proposals and authorization events will appear here when they happen." /></section></div>;
}

function AgentsView({ agents, selected, onSelect, onRefresh }: { agents: Agent[]; selected: Agent | null; onSelect: (id: string) => void; onRefresh: () => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  return <div className="page"><PageIntro eyebrow="Agents" title="Permission, made personal." description="Create and manage the agents you trust. Every agent starts inactive and unauthorized." action={<button className="button button-dark" onClick={() => setCreating(true)}>Add an agent <span>+</span></button>} />{creating && <CreateAgent onCreated={async () => { setCreating(false); await onRefresh(); }} onCancel={() => setCreating(false)} />}{!creating && (agents.length ? <><div className="managed-agents">{agents.map((agent) => <AgentCard key={agent.agentId} agent={agent} selected={selected?.agentId === agent.agentId} onSelect={() => onSelect(agent.agentId)} onRefresh={onRefresh} />)}</div>{selected && <AgentWorkspace agent={selected} />}</> : <div className="wide-empty"><EmptyState title="No agents yet." description="Your first agent is the start of a more intentional way to delegate." action="Create an agent" onAction={() => setCreating(true)} /></div>)}</div>;
}

function AgentWorkspace({ agent }: { agent: Agent }) {
  const [task, setTask] = useState('Find the most useful option for this task.');
  const [taskKind, setTaskKind] = useState<'spend' | 'observe'>('spend');
  const [spend, setSpend] = useState({ amount: '', recipient: '', category: '', reason: '' });
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [state, setState] = useState<'idle' | 'proposed' | 'validating' | 'allowed' | 'rejected' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const [policy, setPolicy] = useState<Policy>({ dailyLimit: '100', perTransactionLimit: '25', allowedCategories: [], allowedRecipients: [] });
  const [policyMessage, setPolicyMessage] = useState('');
  useEffect(() => { void api.policy(agent.agentId).then(setPolicy).catch(() => undefined); }, [agent.agentId]);
  const run = async (event: FormEvent) => {
    event.preventDefault();
    setState('proposed'); setMessage('');
    try {
      const input: AgentTask = taskKind === 'spend'
        ? { action: 'spend', ...spend, reason: spend.reason || task }
        : { action: 'observe', subject: task };
      const next = await api.propose(agent.agentId, input);
      setProposal(next);
      setState('validating');
      const result = await api.checkAuthorization(next);
      if (result.decision === 'allowed') { setState('allowed'); setMessage(result.reason); }
      else { setState('rejected'); setMessage(result.reason); }
    } catch (error) { setState('failed'); setMessage(error instanceof Error ? error.message : 'The agent could not produce a proposal.'); }
  };
  const busy = state === 'proposed' || state === 'validating';
  const execute = async () => {
    if (!proposal || state !== 'allowed') return;
    setState('validating'); setMessage('Submitting the approved request to Midnight Preview…');
    try {
      const result = await api.execute(proposal);
      setState('allowed'); setMessage(`Midnight confirmed transaction ${result.transactionId}.`);
    } catch (error) { setState('failed'); setMessage(error instanceof Error ? error.message : 'Midnight execution failed.'); }
  };
  const savePolicy = async (event: FormEvent) => { event.preventDefault(); try { const saved = await api.savePolicy(agent.agentId, policy); setPolicy(saved); setPolicyMessage('Policy saved.'); } catch (error) { setPolicyMessage(error instanceof Error ? error.message : 'Unable to save policy.'); } };
  return <section className="workspace-panel"><div className="section-title"><div><p className="eyebrow">Agent runtime</p><h2>Give {agent.name} a task.</h2></div><span className="workspace-note">Preview network · Proposal first. Authorization second.</span></div><form className="policy-editor" onSubmit={savePolicy}><div><span className="panel-label">Spending policy</span><p className="field-hint">Canonical recipients and categories are derived by Vouch.</p></div><input className="input" inputMode="numeric" value={policy.dailyLimit} onChange={(event) => setPolicy({ ...policy, dailyLimit: event.target.value })} aria-label="Daily limit" placeholder="Daily limit" /><input className="input" inputMode="numeric" value={policy.perTransactionLimit} onChange={(event) => setPolicy({ ...policy, perTransactionLimit: event.target.value })} aria-label="Per transaction limit" placeholder="Per transaction limit" /><input className="input" value={(policy.allowedRecipients ?? []).join(', ')} onChange={(event) => setPolicy({ ...policy, allowedRecipients: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} aria-label="Allowed recipients" placeholder="Allowed recipients" /><input className="input" value={(policy.allowedCategories ?? []).join(', ')} onChange={(event) => setPolicy({ ...policy, allowedCategories: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} aria-label="Allowed categories" placeholder="Allowed categories" /><button className="button button-quiet">Save policy</button>{policyMessage && <small className="field-hint">{policyMessage}</small>}</form><form className="workspace-form" onSubmit={run}><select className="input" value={taskKind} onChange={(event) => setTaskKind(event.target.value as 'spend' | 'observe')} aria-label="Proposal type"><option value="spend">Ask for a spend proposal</option><option value="observe">Ask for an observation</option></select>{taskKind === 'spend' ? <><input className="input" required inputMode="numeric" value={spend.amount} onChange={(event) => setSpend({ ...spend, amount: event.target.value })} placeholder="Amount (whole units)" aria-label="Proposal amount" /><input className="input" required value={spend.recipient} onChange={(event) => setSpend({ ...spend, recipient: event.target.value })} placeholder="Recipient" aria-label="Proposal recipient" /><input className="input" required value={spend.category} onChange={(event) => setSpend({ ...spend, category: event.target.value })} placeholder="Category" aria-label="Proposal category" /><input className="input" required value={spend.reason} onChange={(event) => setSpend({ ...spend, reason: event.target.value })} placeholder="Reason" aria-label="Proposal reason" /></> : <input className="input" required value={task} onChange={(event) => setTask(event.target.value)} aria-label="Observation task" placeholder="Observation task" />}<button className="button button-dark" disabled={busy || agent.status !== 'active'}>{busy ? 'Working…' : 'Ask agent →'}</button></form>{agent.status !== 'active' && <p className="field-hint">Activate this agent before asking it to work.</p>}{proposal && <div className="proposal-card"><div className="proposal-head"><span className="panel-label">Proposal</span><span className={`proposal-state ${state}`}>{state === 'allowed' ? 'Policy passed' : state === 'rejected' ? 'Rejected' : state === 'failed' ? 'Failed' : state === 'validating' ? 'Checking Midnight' : 'Proposed'}</span></div><div className="proposal-content"><strong>{proposal.action === 'spend' ? `Spend ${proposal.amount ?? ''}` : 'Observe'}</strong><p>{proposal.action === 'spend' ? `${proposal.category ?? 'Uncategorized'} · ${proposal.recipient ?? 'No recipient'}` : proposal.subject}</p><small>{proposal.reason ?? 'The agent proposed this action from your task.'}</small></div>{message && <div className="proposal-message">{message}</div>}{state === 'allowed' && proposal.action === 'spend' && <button className="button button-dark" onClick={() => void execute()}>Approve and execute on Midnight →</button>}</div>}</section>;
}

function CreateAgent({ onCreated, onCancel }: { onCreated: () => Promise<void>; onCancel: () => void }) {
  const [type, setType] = useState<AgentType>('developer'); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { await api.createAgent({ name, type }); await onCreated(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create agent.'); } finally { setBusy(false); } };
  return <form className="create-flow" onSubmit={submit}><div className="flow-head"><div><p className="eyebrow">New agent</p><h2>Choose who will act.</h2></div><button type="button" className="close-button" onClick={onCancel} aria-label="Cancel">×</button></div><div className="type-options">{(Object.keys(agentMeta) as AgentType[]).map((option) => <button type="button" key={option} className={type === option ? 'type-option selected' : 'type-option'} onClick={() => setType(option)}><img src={agentMeta[option].image} alt="" /><strong>{agentMeta[option].label}</strong><span>{agentMeta[option].description}</span></button>)}</div><label className="field-label" htmlFor="agent-name">Give your agent a name</label><input id="agent-name" className="input" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Studio Researcher" />{type === 'custom' && <p className="field-hint">Custom is for developers who already have an autonomous agent they built themselves. It does not connect ChatGPT or Claude for you.</p>}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button className="button button-dark" disabled={busy}>{busy ? 'Creating…' : 'Create agent →'}</button></div></form>;
}

function AgentCard({ agent, selected, onSelect, onRefresh }: { agent: Agent; selected: boolean; onSelect: () => void; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [renaming, setRenaming] = useState(false); const [name, setName] = useState(agent.name);
  const mutate = async (action: 'activate' | 'deactivate' | 'revoke') => { if (action === 'revoke' && !window.confirm('Revoke this agent? This cannot be undone.')) return; setBusy(true); try { await api.lifecycle(agent.agentId, action); await onRefresh(); } finally { setBusy(false); } };
  const rename = async () => { setBusy(true); try { await api.renameAgent(agent.agentId, name); setRenaming(false); await onRefresh(); } finally { setBusy(false); } };
  const meta = agentMeta[agent.type];
  return <article className={selected ? 'managed-agent selected' : 'managed-agent'} onClick={onSelect}><div className="managed-agent-main"><img src={meta.image} alt={`${meta.label} agent`} /><div><span className="agent-type">{meta.label} agent</span>{renaming ? <input className="inline-input" value={name} onChange={(e) => setName(e.target.value)} onClick={(e) => e.stopPropagation()} /> : <h2>{agent.name}</h2>}<div className="agent-status"><span className={`status-dot ${agent.status}`} />{agent.status}<span className="status-separator">·</span>{agent.authorization.status === 'authorized' ? 'Authorized' : 'Not authorized'}</div></div></div><div className="managed-agent-actions">{renaming ? <button className="text-button" disabled={busy} onClick={(e) => { e.stopPropagation(); void rename(); }}>Save</button> : <button className="text-button" onClick={(e) => { e.stopPropagation(); setRenaming(true); }}>Rename</button>}{agent.status !== 'revoked' && <button className="text-button" disabled={busy} onClick={(e) => { e.stopPropagation(); void mutate(agent.status === 'active' ? 'deactivate' : 'activate'); }}>{agent.status === 'active' ? 'Deactivate' : 'Activate'}</button>}{agent.status !== 'revoked' && <button className="text-button danger" disabled={busy} onClick={(e) => { e.stopPropagation(); void mutate('revoke'); }}>Revoke</button>}</div></article>;
}

function ActivityView() { const [items, setItems] = useState<ActivityRecord[]>([]); const [agentId, setAgentId] = useState(''); useEffect(() => { void api.listAgents().then((list) => { const id = list[0]?.agentId; if (id) { setAgentId(id); return api.activity(id).then(setItems); } return undefined; }).catch(() => undefined); }, []); return <div className="page"><PageIntro eyebrow="Activity" title="A record of what happened." description="Activity is loaded from the authenticated Vouch API." />{items.length ? <div className="activity-list">{items.map((item) => <article className="activity-row" key={item.id}><div><strong>{item.event}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></div>{item.transactionId && <code>{item.transactionId}</code>}</article>)}</div> : <div className="wide-empty"><EmptyState title={agentId ? 'No activity yet.' : 'Select an agent first.'} description="Real proposals, policy decisions, and Midnight transaction IDs will appear here." /></div>}</div>; }
function SettingsView({ wallet }: { wallet: WalletState }) { return <div className="page"><PageIntro eyebrow="Settings" title="Keep the essentials clear." description="Settings will appear here as the application gains supported preferences." /><div className="settings-list"><div><span>Wallet connection</span><strong>{wallet.connection ? wallet.connection.walletName : 'Not connected'}</strong></div><div><span>Network</span><strong>{wallet.connection?.networkId ?? 'No active connection'}</strong></div><div><span>Authorization</span><strong>Midnight remains authoritative</strong></div></div>{wallet.error && <div className="notice" role="alert">{wallet.error}</div>}</div>; }
function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function EmptyState({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) { return <div className="empty-state"><div className="empty-mark">V</div><h2>{title}</h2><p>{description}</p>{action && onAction && <button className="button button-dark" onClick={onAction}>{action} <span>→</span></button>}</div>; }
