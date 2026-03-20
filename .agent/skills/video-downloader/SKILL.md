---
name: video-downloader
description: Download public YouTube and TikTok videos from a provided URL, save the file locally, inspect metadata without downloading, extract audio from a YouTube or TikTok link, or process a UTF-8 file of public video URLs. Use this skill whenever the user wants to download this YouTube or TikTok video, save a video locally, extract audio from a link, or download videos from a list of URLs on Windows with yt-dlp and FFmpeg.
---

# Video Downloader

Use this skill to download a public YouTube or TikTok video to a local Windows folder with `yt-dlp` and FFmpeg. This skill is Windows-first, uses PowerShell examples, and returns a clear result summary after each run.

## When to Use This Skill

Use this skill when the user:

- Wants to download a public YouTube video by URL
- Wants to download a public TikTok video by URL
- Says "download this video", "save this video locally", or "grab this link"
- Wants metadata without downloading the media file
- Wants audio-only output from a YouTube or TikTok link
- Has a UTF-8 text file with one public video URL per line and wants batch processing
- Needs the saved file path, filename, and basic media metadata reported back after the command finishes

Do not use this skill for private videos, login-gated content, cookies, subtitles, playlists, channels, or TikTok photos/slideshows.

## Supported Scope

This V1 skill supports public videos only.

Supported inputs:

- Public YouTube watch URLs, including `https://www.youtube.com/watch?v=...`
- Public YouTube Shorts URLs
- Public `https://youtu.be/...` URLs
- Public TikTok video URLs
- Public TikTok share URLs that resolve to a single public video
- A UTF-8 batch file with one supported public URL per line

Supported operations:

- Single URL download
- Metadata-only inspection
- Custom filename template
- Audio-only export
- Batch URL file processing

Out of scope for V1:

- No cookies
- No private videos
- No subtitles
- No playlists or channel scraping promises beyond explicit batch file input
- No TikTok photos/slideshows
- No auth-gated or region-bypass workflows

Default output directory:

```powershell
$OutputDir = "$env:USERPROFILE\Downloads\video-downloader"
```

Override `$OutputDir` only when the user asks for a different save location.

## Prerequisites

Preferred Windows setup:

1. Install standalone `yt-dlp.exe`
2. Install FFmpeg and make sure `ffmpeg.exe` is on `PATH`
3. Verify both commands before any download attempt

Primary Windows-first guidance:

- Put `yt-dlp.exe` somewhere on `PATH`, or keep it in a known tools folder already on `PATH`
- Install FFmpeg so `ffmpeg` works from a fresh PowerShell session
- Restart PowerShell after changing `PATH` if command discovery is stale

Fallback only if the standalone binary is not available:

```powershell
py -m pip install -U yt-dlp
```

Verification commands:

```powershell
yt-dlp --version
ffmpeg -version
```

Stop rule:

- If `yt-dlp --version` fails, stop. Do not attempt metadata or downloads.
- If `ffmpeg -version` fails, stop. Do not attempt best-quality muxing or audio extraction.

## Quick Start

Set the common PowerShell variables first:

```powershell
$Url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
$OutputDir = "$env:USERPROFILE\Downloads\video-downloader"
$NameTemplate = "%(title)s-%(id)s.%(ext)s"
$BatchFile = "$env:USERPROFILE\Downloads\video-downloader\urls.txt"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
```

Download a single public video:

```powershell
yt-dlp -P $OutputDir -o $NameTemplate $Url
```

Inspect metadata only:

```powershell
yt-dlp --dump-single-json --skip-download $Url
```

## Command Recipes

### Single public video download

```powershell
$Url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
$OutputDir = "$env:USERPROFILE\Downloads\video-downloader"
$NameTemplate = "%(title)s-%(id)s.%(ext)s"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
yt-dlp -P $OutputDir -o $NameTemplate $Url
```

### Metadata-only

Use this when the user wants details first and no file download.

```powershell
$Url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
yt-dlp --dump-single-json --skip-download $Url
```

### Custom filename template

```powershell
$Url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
$OutputDir = "$env:USERPROFILE\Downloads\video-downloader"
$NameTemplate = "%(uploader)s-%(title)s-%(id)s.%(ext)s"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
yt-dlp -P $OutputDir -o $NameTemplate $Url
```

### Audio-only

Use this when the user wants audio-only output.

```powershell
$Url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
$OutputDir = "$env:USERPROFILE\Downloads\video-downloader"
$NameTemplate = "%(title)s-%(id)s.%(ext)s"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
yt-dlp -x --audio-format mp3 -P $OutputDir -o $NameTemplate $Url
```

### Batch URL file

The batch file must be a UTF-8 text file with one supported public URL per line.

```powershell
$BatchFile = "$env:USERPROFILE\Downloads\video-downloader\urls.txt"
$OutputDir = "$env:USERPROFILE\Downloads\video-downloader"
$NameTemplate = "%(title)s-%(id)s.%(ext)s"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
yt-dlp -a $BatchFile -P $OutputDir -o $NameTemplate
```

### Batch metadata-only

```powershell
$BatchFile = "$env:USERPROFILE\Downloads\video-downloader\urls.txt"
yt-dlp -a $BatchFile --dump-single-json --skip-download
```

## Output Contract

After each run, report the result in plain language with these fields when available:

- source URL
- platform
- saved file path
- final filename
- title
- uploader/channel
- duration when available
- extractor/platform
- mode, either download or metadata-only

If the run was metadata-only, say clearly that no media file was saved.

Suggested response shape:

```text
Mode: download
Source URL: <original URL>
Platform: YouTube or TikTok
Saved file path: <full local path, or none for metadata-only>
Final filename: <actual filename, or none for metadata-only>
Title: <title if available>
Uploader/Channel: <uploader if available>
Duration: <duration if available>
Extractor/Platform: <extractor key if available>
```

## Failure Handling

Use these rules exactly:

- Missing `yt-dlp` or FFmpeg: stop immediately. Report which dependency check failed.
- Unsupported URL shape: stop and say the link is outside the supported public YouTube or TikTok video scope.
- HTTP 403 on TikTok or YouTube: retry only if the failure looks transient. If the public TikTok URL appears to need auth or cookies, stop and report out of scope for V1.
- HTTP 429: stop, report rate limiting, and tell the user to retry later instead of hammering the service.
- Metadata succeeds but download fails: report the metadata result and the failed download step separately.
- FFmpeg missing during audio extraction: stop, report that audio-only requires FFmpeg, and do not improvise a partial workflow.
- If a TikTok URL resolves to photos, slideshows, or non-video content, stop and report unsupported scope.

Do not invent cookie workarounds. Do not promise private-video access. Do not continue past dependency failures.

## Legal / ToS Notes

Only download content when the operator has permission to do so. Respect platform ToS, copyright, and any local usage rules. This skill is a technical workflow guide, not legal advice.

## Verified Test URLs

Use these fixed public fixtures for basic validation:

- YouTube: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- TikTok: `https://www.tiktok.com/@tiktok/video/7505091006149283103`

If a fixture is dead, record the replacement in this section before testing continues.

Useful validation commands:

```powershell
$OutputDir = "$env:USERPROFILE\Downloads\video-downloader"
$NameTemplate = "%(title)s-%(id)s.%(ext)s"
$BatchFile = "$env:USERPROFILE\Downloads\video-downloader\urls.txt"
$YouTubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
$TikTokUrl = "https://www.tiktok.com/@tiktok/video/7505091006149283103"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path ".sisyphus/evidence" | Out-Null
yt-dlp --dump-single-json --skip-download $YouTubeUrl | Out-File ".sisyphus/evidence/video-downloader-youtube-metadata.json" -Encoding utf8
yt-dlp --dump-single-json --skip-download $TikTokUrl | Out-File ".sisyphus/evidence/video-downloader-tiktok-metadata.json" -Encoding utf8
yt-dlp -P $OutputDir -o $NameTemplate $YouTubeUrl | Out-File ".sisyphus/evidence/video-downloader-youtube-download.log" -Encoding utf8
yt-dlp -x --audio-format mp3 -P $OutputDir -o $NameTemplate $YouTubeUrl | Out-File ".sisyphus/evidence/video-downloader-youtube-audio.log" -Encoding utf8
Set-Content -Path $BatchFile -Value @($YouTubeUrl, $TikTokUrl) -Encoding utf8
yt-dlp -a $BatchFile --dump-single-json --skip-download | Out-File ".sisyphus/evidence/video-downloader-batch-metadata.json" -Encoding utf8
```
