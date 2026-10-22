param(
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\artifacts\audio-source'),
  [string]$AssetDir = (Join-Path $PSScriptRoot '..\assets\audio')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

function Wait-WinRtOperation {
  param(
    [Parameter(Mandatory = $true)]$Operation,
    [Parameter(Mandatory = $true)][Type]$ResultType
  )

  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethod -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Save-SpeechStream {
  param(
    [Parameter(Mandatory = $true)]$Stream,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $input = $Stream.GetInputStreamAt(0)
  $reader = [Windows.Storage.Streams.DataReader]::New($input)
  [void](Wait-WinRtOperation -Operation $reader.LoadAsync([uint32]$Stream.Size) -ResultType ([uint32]))
  $bytes = New-Object byte[] ([int]$Stream.Size)
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($Path, $bytes)
  $reader.Dispose()
  $input.Dispose()
  $Stream.Dispose()
}

function New-SpeechAsset {
  param(
    [Parameter(Mandatory = $true)]$Synthesizer,
    [Parameter(Mandatory = $true)][string]$Ssml,
    [Parameter(Mandatory = $true)][string]$FileName
  )

  $operation = $Synthesizer.SynthesizeSsmlToStreamAsync($Ssml)
  $stream = Wait-WinRtOperation -Operation $operation -ResultType ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  Save-SpeechStream -Stream $stream -Path (Join-Path $OutputDir $FileName)
}

[System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null
[System.IO.Directory]::CreateDirectory($AssetDir) | Out-Null

$synthesizer = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::New()
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
  Where-Object { $_.DisplayName -eq 'Microsoft Yaoyao' } |
  Select-Object -First 1
if (-not $voice) {
  $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
    Where-Object { $_.Language -eq 'zh-CN' } |
    Select-Object -First 1
}
if (-not $voice) {
  throw 'No zh-CN Windows speech voice is installed.'
}
$synthesizer.Voice = $voice

$chou = [char]0x81ED
$bao = [char]0x5B9D
$ni = [char]0x4F60
$ye = [char]0x4E5F
$tai = [char]0x592A
$li = [char]0x5389
$hai = [char]0x5BB3
$la = [char]0x5566
$tong = [char]0x901A
$guan = [char]0x5173

$slowSsml = @"
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <prosody pitch="+20%" rate="+8%" volume="+8%">$chou</prosody>
  <break time="22ms" />
  <prosody pitch="+38%" rate="-3%" volume="+12%"><emphasis level="strong">$bao</emphasis></prosody>
</speak>
"@
New-SpeechAsset -Synthesizer $synthesizer -Ssml $slowSsml -FileName 'choubao.wav'

$winSsml = @"
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <prosody pitch="+24%" rate="+10%" volume="+10%"><emphasis level="strong">$chou$bao</emphasis></prosody>
  <break time="80ms" />
  <prosody pitch="+18%" rate="+12%">$tong$guan$la!</prosody>
  <break time="65ms" />
  <prosody pitch="+28%" rate="+9%" volume="+10%">$ni$ye$tai$li$hai$la!</prosody>
</speak>
"@
New-SpeechAsset -Synthesizer $synthesizer -Ssml $winSsml -FileName 'choubao-win.wav'

$noteSsml = @"
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <prosody rate="+24%" volume="+12%"><emphasis level="moderate">$bao</emphasis></prosody>
</speak>
"@
New-SpeechAsset -Synthesizer $synthesizer -Ssml $noteSsml -FileName 'bao.wav'

$synthesizer.Dispose()
$processor = Join-Path $PSScriptRoot 'process-voice-assets.js'
& node $processor $OutputDir $AssetDir
if ($LASTEXITCODE -ne 0) {
  throw 'Voice asset post-processing failed.'
}
Write-Host ("Generated and processed childlike voice assets with {0}." -f $voice.DisplayName)
