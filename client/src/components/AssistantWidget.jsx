import { useEffect, useMemo, useRef, useState } from 'react';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { IconSparkles, IconX, IconRefresh } from './Icons.jsx';

const STARTERS = [
  '📋 Daily operations report',
  'Which shipments are delayed or overdue?',
  'Any critical exceptions right now?',
  'Delivery performance stats',
];

// Lightweight renderer: **bold**, bullet lines, numbered lines, paragraphs.
function Rich({ text }) {
  const chunks = useMemo(() => text.split('\n'), [text]);
  return (
    <div className="rich-text">
      {chunks.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;
        const isBullet = trimmed.startsWith('- •') || trimmed.startsWith('- ') || /^[-•]/.test(trimmed);
        const isNumber = /^\d+\.\s/.test(trimmed);
        const content = trimmed.replace(/^[-•]\s*/, '');
        const inner = content.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? <b key={j}>{part.slice(2, -2)}</b> : part
        );
        return (
          <div key={i} className={`rich-line ${isBullet || isNumber ? 'is-list' : ''}`}>
            {isBullet && <span className="rich-bullet">•</span>}
            <span>{inner}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState(STARTERS);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (open && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          text: `Hi ${user?.name?.split(' ')[0] || 'there'}! 👋 I'm your **SmartShip Assistant**. Ask me anything about shipments, delays, exceptions or performance — I answer from **live operational data**.`,
          source: null,
        },
      ]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setBusy(true);
    setChips([]);
    try {
      const { data } = await api.post('/assistant/chat', { message: msg, history });
      setMessages((m) => [...m, { role: 'assistant', text: data.answer, source: data.source }]);
      if (data.followUps?.length) setChips(data.followUps);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `⚠ ${errMsg(err, 'I had trouble answering that — please try again.')}`, source: 'error' },
      ]);
      setChips(STARTERS);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setChips(STARTERS);
    setTimeout(() => {
      setMessages([
        { role: 'assistant', text: 'Fresh start! What would you like to know about the network?', source: null },
      ]);
    }, 0);
  };

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open AI assistant">
          <IconSparkles size={21} />
          <span className="chat-fab-pulse" />
        </button>
      )}
      {open && (
        <div className="chat-panel" role="dialog" aria-label="AI Logistics Assistant">
          <div className="chat-head">
            <div className="chat-head-icon"><IconSparkles size={17} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="chat-title">SmartShip Assistant</div>
              <div className="chat-sub">AI logistics analyst · live data</div>
            </div>
            <button className="chat-head-btn" onClick={clear} title="New conversation"><IconRefresh size={15} /></button>
            <button className="chat-head-btn" onClick={() => setOpen(false)} title="Close"><IconX size={15} /></button>
          </div>

          <div className="chat-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-bubble">
                  <Rich text={m.text} />
                  {m.source && (
                    <div className="chat-source">
                      <span className={`dot ${m.source.startsWith('gemini') ? 'ok' : 'warn'}`} style={{ width: 6, height: 6 }} />
                      {m.source}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="chat-msg assistant">
                <div className="chat-bubble typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            {chips.length > 0 && !busy && (
              <div className="chat-chips">
                {chips.map((c, i) => (
                  <button key={i} className="chat-chip" onClick={() => send(c)}>{c}</button>
                ))}
              </div>
            )}
          </div>

          <form
            className="chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              className="input chat-input"
              placeholder="Ask about shipments, delays, exceptions…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              maxLength={1000}
            />
            <button className="chat-send" type="submit" disabled={busy || !input.trim()} aria-label="Send message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
