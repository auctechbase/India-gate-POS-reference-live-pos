import React, { useEffect, useState } from 'react';

// Home screen: "Update now" when a new version has been downloaded, and the version with a
// "Check for updates" button. Only in the installed app (window.electronAPI with update calls).
export default function UpdateBar() {
    const api = window.electronAPI;
    const supported = !!(api && api.getUpdateStatus);
    const [status, setStatus] = useState(null);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        if (!supported) return;
        let alive = true;
        api.getUpdateStatus().then(s => alive && setStatus(s)).catch(() => {});
        const stop = api.onUpdateStatus(s => alive && setStatus(s));
        // Opening the home screen also looks for an update (at most every 10 minutes).
        api.checkForUpdates(true).then(s => alive && s && setStatus(s)).catch(() => {});
        return () => { alive = false; stop && stop(); };
    }, [supported]);

    if (!supported || !status) return null;

    const install = async () => {
        setInstalling(true);
        try {
            const result = await api.installUpdateNow();
            if (!result?.ready) setInstalling(false);
        } catch (e) {
            setInstalling(false);
        }
    };
    const check = () => {
        setStatus(s => ({ ...s, state: 'checking' }));
        api.checkForUpdates(false).then(s => s && setStatus(s)).catch(() => {});
    };

    const { state, current, version, percent, error } = status;

    return (
        <>
            {state === 'ready' && (
                <div className="update-bar update-bar-ready">
                    <i className="mdi mdi-download-circle" />
                    <span>
                        {installing
                            ? 'Installing the update… the POS will close and open again by itself in about a minute.'
                            : <>New version <b>{version}</b> is ready.</>}
                    </span>
                    {!installing && (
                        <button type="button" className="btn btn-success" onClick={install}>Update now</button>
                    )}
                </div>
            )}
            {state === 'downloading' && (
                <div className="update-bar">
                    <i className="mdi mdi-progress-download" />
                    <span>Downloading version {version}… {percent ? `${percent}%` : ''}</span>
                </div>
            )}
            <div className="update-version">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}Version {current}
                {state === 'latest' && <span> · up to date</span>}
                {state === 'error' && <span title={error}> · could not check (no internet?)</span>}
                {(state === 'idle' || state === 'latest' || state === 'error') && (
                    <button type="button" className="btn btn-link btn-sm" onClick={check}>Check for updates</button>
                )}
                {state === 'checking' && <span> · checking…</span>}
            </div>
        </>
    );
}
