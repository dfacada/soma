# Says which voiceover line each piece of a recording is, with Windows' own speech recognizer, listening only for the
# script's lines (and their sentences, so a stumble that stops part-way is still placed). voice.py cuts the recording
# into pieces at its pauses and calls this to tell a retake from the take before it. Nothing leaves this computer.
#
#   powershell -File ad/recognize.ps1 <pieces.json> <phrases.json> <out.json>
#
# pieces.json: a list of 16 kHz mono PCM wav files. phrases.json: a list of phrases in plain words. out.json: for each
# piece, the phrase heard (or "") and how sure the recognizer was.
param([string]$PieceList, [string]$PhraseList, [string]$Out)
Add-Type -AssemblyName System.Speech
# PowerShell names ignore case, so these must not share a name with the [string] parameters above; and Windows
# PowerShell's ConvertFrom-Json hands an array over whole, so it is assigned first, never wrapped in @().
$wanted = Get-Content $PhraseList -Raw | ConvertFrom-Json
$files = Get-Content $PieceList -Raw | ConvertFrom-Json
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]"en-US")
$choices = New-Object System.Speech.Recognition.Choices
foreach ($p in $wanted) { $choices.Add([string]$p) }
$engine.LoadGrammar((New-Object System.Speech.Recognition.Grammar((New-Object System.Speech.Recognition.GrammarBuilder($choices)))))
$engine.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.5)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.5)
$engine.InitialSilenceTimeout = [TimeSpan]::Zero
$engine.BabbleTimeout = [TimeSpan]::Zero
$heard = @()
foreach ($f in $files) {
  $text = ""; $conf = 0
  try {
    $engine.SetInputToWaveFile([string]$f)
    $r = $engine.Recognize()
    if ($r -ne $null) { $text = [string]$r.Text; $conf = [math]::Round($r.Confidence, 3) }
  } catch { }
  $engine.SetInputToNull()
  $heard += [pscustomobject]@{ file = [string]$f; text = $text; conf = $conf }
}
$engine.Dispose()
ConvertTo-Json -InputObject @($heard) -Depth 3 | Set-Content -Encoding utf8 $Out
