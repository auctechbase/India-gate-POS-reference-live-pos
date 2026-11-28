const { spawn } = require('child_process');

// While an update installs the POS is closed, so for a minute or two there is nothing on screen and
// people think it broke. This shows a small "Updating…" window from a separate PowerShell process
// (it has to outlive the app). It closes by itself once the new version answers on the POS port:
// first the old POS must stop answering, then the new one start. After 15 minutes it says to use
// the desktop icon and can be closed with a click.
const SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$port = __PORT__
$version = '__VERSION__'
$start = Get-Date
$seenDown = $false
function Test-Pos {
    try { $c = New-Object Net.Sockets.TcpClient; $r = $c.BeginConnect('127.0.0.1', $port, $null, $null)
          $ok = $r.AsyncWaitHandle.WaitOne(500) -and $c.Connected; $c.Close(); return $ok } catch { return $false }
}
$f = New-Object Windows.Forms.Form
$f.Text = 'Updating India Gate POS'
$f.FormBorderStyle = 'FixedSingle'; $f.ControlBox = $false
$f.StartPosition = 'CenterScreen'; $f.TopMost = $true; $f.BackColor = 'White'
$f.ClientSize = New-Object Drawing.Size(600, 230)
$l = New-Object Windows.Forms.Label
$l.Dock = 'Fill'; $l.TextAlign = 'MiddleCenter'; $l.Font = New-Object Drawing.Font('Segoe UI', 15)
$l.Text = "Updating India Gate POS to version $version" + [Environment]::NewLine + [Environment]::NewLine +
          "It will open again by itself in a minute or two." + [Environment]::NewLine +
          "Please don't turn off the computer."
$f.Controls.Add($l)
$t = New-Object Windows.Forms.Timer
$t.Interval = 2000
$t.Add_Tick({
    $up = Test-Pos
    if (-not $up) { $script:seenDown = $true }
    elseif ($script:seenDown) { $t.Stop(); $f.Close(); return }
    if (((Get-Date) - $start).TotalMinutes -gt 15) {
        $t.Stop()
        $l.Text = "The update is taking longer than expected." + [Environment]::NewLine +
                  "If the POS does not open, double-click the India Gate POS icon on the desktop." +
                  [Environment]::NewLine + [Environment]::NewLine + "(Click here to close this message)"
        $l.Add_Click({ $f.Close() })
    }
})
$t.Start()
[Windows.Forms.Application]::Run($f)
`;

function showUpdatingWindow({ port, version }) {
    const script = SCRIPT.replace('__PORT__', String(Number(port) || 5200))
        .replace('__VERSION__', String(version || '').replace(/[^0-9A-Za-z.\-]/g, ''));
    // Through `start`: PowerShell gets its own process and console, so it keeps running when the
    // POS quits. (Started directly it shares the POS's console and dies with it; started with
    // Node's detached option its window never shows.) The arguments are plain words and base64,
    // so cmd needs no quoting.
    const child = spawn('cmd.exe', [
        '/d', '/c', 'start', '""', 'powershell.exe',
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
    ], { stdio: 'ignore', windowsHide: true });
    child.unref();
}

module.exports = { showUpdatingWindow };
