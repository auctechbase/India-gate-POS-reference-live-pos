import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './TouchKeyboard.css';

/**
 * On-screen keyboard for the touchscreen, docked to the bottom of the screen.
 *
 * It is "controlled": it always edits `value` and reports the new text through `onChange`, so
 * what you see in the field is exactly what the keyboard edits (no separate internal buffer).
 *
 *   <TouchKeyboard
 *     open={focused === 'name'}
 *     value={fields.name}
 *     onChange={name => setFields({ ...fields, name })}
 *     layout="text"            // "text" | "decimal" (price, cash) | "integer" (stock, count)
 *     label="Product name"
 *     onClose={() => setFocused('')}
 *     onDone={save}            // optional: Done button calls this (otherwise it closes)
 *     masked                   // optional: show •••• in the preview (passwords)
 *   />
 */
const TEXT_ROWS = {
    lower: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
        ['{shift}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '{bksp}'],
        ['{symbols}', '@', '{space}', ',', '{done}'],
    ],
    upper: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
        ['{shift}', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '{bksp}'],
        ['{symbols}', '@', '{space}', ',', '{done}'],
    ],
    symbols: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['!', '@', '#', '€', '₹', '%', '&', '*', '(', ')'],
        ['/', '+', '=', '_', ':', ';', '"', "'", '?', '-'],
        ['{abc}', '<', '>', '[', ']', '{', '}', '.', ',', '{bksp}'],
        ['{abc}', '{space}', '{done}'],
    ],
};

const NUM_ROWS = {
    decimal: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '{bksp}']],
    integer: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['00', '0', '{bksp}']],
};

const LABELS = {
    '{bksp}': <i className="mdi mdi-backspace-outline" />,
    '{shift}': <i className="mdi mdi-apple-keyboard-shift" />,
    '{space}': 'space',
    '{symbols}': '#+=',
    '{abc}': 'ABC',
    '{done}': 'Done',
};

export default function TouchKeyboard({
    open, value, onChange, layout = 'text', label, onClose, onDone, masked = false,
}) {
    const [mode, setMode] = useState('lower');
    const [capsLock, setCapsLock] = useState(false);
    const panelRef = useRef(null);
    const repeatRef = useRef(null);
    const valueRef = useRef(value);
    valueRef.current = value == null ? '' : String(value);
    const numeric = layout === 'decimal' || layout === 'integer';

    // Make room at the bottom of the page and keep the field being edited visible.
    useLayoutEffect(() => {
        if (!open || !panelRef.current) return undefined;
        const height = panelRef.current.offsetHeight;
        document.body.style.paddingBottom = `${height}px`;
        const active = document.activeElement;
        if (active && active.tagName === 'INPUT') {
            const rect = active.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - height - 16) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return () => { document.body.style.paddingBottom = ''; };
    }, [open, layout]);

    useEffect(() => () => clearInterval(repeatRef.current), []);
    useEffect(() => { if (!open) { setMode('lower'); setCapsLock(false); } }, [open]);

    if (!open) return null;

    const emit = (next) => onChange && onChange(next);

    const press = (key) => {
        const current = valueRef.current;
        switch (key) {
            case '{bksp}': emit(current.slice(0, -1)); return;
            case '{space}': emit(current + ' '); return;
            case '{shift}':
                // tap = one capital letter, tap again while upper = caps lock, third tap = off
                if (mode === 'upper' && !capsLock) setCapsLock(true);
                else { setCapsLock(false); setMode(mode === 'upper' ? 'lower' : 'upper'); }
                return;
            case '{symbols}': setMode('symbols'); return;
            case '{abc}': setMode('lower'); return;
            case '{done}': (onDone || onClose)?.(); return;
            case '.':
                if (layout === 'decimal' && current.includes('.')) return; // one decimal point
                emit((layout === 'decimal' && current === '' ? '0' : current) + '.');
                return;
            default:
                emit(current + key);
                if (mode === 'upper' && !capsLock) setMode('lower');
        }
    };

    // Act on pointerdown (instant on touch) and keep the focus in the input field.
    const onPointerDown = (key) => (e) => {
        e.preventDefault();
        press(key);
        if (key === '{bksp}') {
            clearInterval(repeatRef.current);
            const started = Date.now();
            repeatRef.current = setInterval(() => {
                if (Date.now() - started > 450) press('{bksp}');
            }, 70);
        }
    };
    const stopRepeat = () => clearInterval(repeatRef.current);

    const rows = numeric ? NUM_ROWS[layout] : TEXT_ROWS[mode];
    const preview = masked ? '•'.repeat(valueRef.current.length) : valueRef.current.slice(-40);

    return (
        <div ref={panelRef} className={`touch-kb ${numeric ? 'touch-kb--numeric' : ''}`} role="dialog" aria-label="On-screen keyboard"
            onPointerDown={e => e.preventDefault()}>
            <div className="touch-kb__bar">
                <div className="touch-kb__preview">
                    {label && <span className="touch-kb__label">{label}</span>}
                    <span className="touch-kb__value">{preview || <span className="touch-kb__placeholder">…</span>}</span>
                </div>
                <button type="button" className="touch-kb__action" onPointerDown={e => { e.preventDefault(); emit(''); }}>
                    Clear
                </button>
                <button type="button" className="touch-kb__action" onPointerDown={e => { e.preventDefault(); onClose?.(); }}>
                    <i className="mdi mdi-keyboard-close" /> Hide
                </button>
            </div>
            <div className="touch-kb__keys">
                {rows.map((row, r) => (
                    <div className="touch-kb__row" key={r}>
                        {row.map((key, k) => (
                            <button
                                type="button"
                                key={`${r}-${k}`}
                                className={[
                                    'touch-kb__key',
                                    key.startsWith('{') && key.length > 1 && key !== '{space}' ? 'touch-kb__key--fn' : '',
                                    key === '{space}' ? 'touch-kb__key--space' : '',
                                    key === '{done}' ? 'touch-kb__key--done' : '',
                                    key === '{shift}' && mode === 'upper' ? 'touch-kb__key--on' : '',
                                    key === '{shift}' && capsLock ? 'touch-kb__key--lock' : '',
                                ].join(' ')}
                                onPointerDown={onPointerDown(key)}
                                onPointerUp={stopRepeat}
                                onPointerLeave={stopRepeat}
                                onPointerCancel={stopRepeat}
                            >
                                {LABELS[key] ?? key}
                            </button>
                        ))}
                    </div>
                ))}
                {numeric && (
                    <div className="touch-kb__row">
                        <button type="button" className="touch-kb__key touch-kb__key--done touch-kb__key--wide"
                            onPointerDown={onPointerDown('{done}')}>Done</button>
                    </div>
                )}
            </div>
        </div>
    );
}
