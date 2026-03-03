# How to Run the Transcription System

## Step 1: Install FFmpeg (Required)

FFmpeg is required to extract audio from videos.

### Windows:
1. Download from: https://ffmpeg.org/download.html
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to your System PATH
4. Restart your terminal/command prompt
5. Verify: `ffmpeg -version`

### Mac:
```bash
brew install ffmpeg
```

### Linux:
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

## Step 2: Install Python Dependencies

```bash
# Install the required packages
pip install librosa soundfile transformers torch flask flask-cors

# Or install all requirements
pip install -r requirements.txt
```

**Note:** First run will download the model (~244MB)

## Step 3: Run Database Migration

1. Go to your Supabase Dashboard
2. Open SQL Editor
3. Run the contents of: `supabase/migrations/add_transcription_columns.sql`

Or run via psql:
```bash
psql -h <host> -U postgres -d postgres -f supabase/migrations/add_transcription_columns.sql
```

## Step 4: Test the Transcription Service

### Option A: Test with a local video file
```bash
python transcription_service.py ./path/to/your/video.mp4
```

### Option B: Process a submitted video from database
```bash
# Process a specific assessment by ID
python process_transcription.py --single <assessment_id>

# Example:
python process_transcription.py --single 123e4567-e89b-12d3-a456-426614174000
```

### Option C: Process all pending transcriptions
```bash
# Process up to 5 pending videos
python process_transcription.py --batch 5

# Or process all
python process_transcription.py --batch 100
```

### Option D: Retry failed transcriptions
```bash
python process_transcription.py --retry
```

## Step 5: Start the API Server (Optional)

If you want to trigger transcriptions via HTTP API:

```bash
python trigger_transcription.py
```

The server will start on http://localhost:5000

### API Endpoints:
- `POST /api/trigger-transcription` - Start transcription
- `GET /api/transcription-status/<id>` - Check status
- `GET /api/health` - Health check

### Example API call:
```bash
curl -X POST http://localhost:5000/api/trigger-transcription \
  -H "Content-Type: application/json" \
  -d '{"assessment_id": "your-assessment-id", "language": "en"}'
```

## Integration with Admin Dashboard

When you view a video assessment in the Admin Dashboard, you'll see:
1. Transcription status badge
2. "Start Transcription" button (if pending)
3. Full transcription text (when completed)
4. Timestamped segments (when completed)

## Automation (Recommended)

### Option 1: Auto-run after video upload

Add to `VideoAssessment.tsx` after successful video submission:

```typescript
// After video upload completes
await fetch('http://localhost:5000/api/trigger-transcription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    assessment_id: assessment.id,
    language: 'en'
  })
});
```

### Option 2: Scheduled batch processing

Create a scheduled task/cron job to run periodically:

**Windows Task Scheduler:**
```
Program: python
Arguments: process_transcription.py --batch 10
Start in: C:\path\to\your\project
```

**Linux/Mac Cron:**
```bash
# Run every 5 minutes
*/5 * * * * cd /path/to/project && python process_transcription.py --batch 10 >> /var/log/transcription.log 2>&1
```

### Option 3: Webhook trigger

Set up a Supabase webhook to trigger transcription when a video is uploaded.

## Troubleshooting

### "FFmpeg not found"
- Make sure FFmpeg is installed and in your PATH
- Restart your terminal after installing

### "CUDA out of memory"
- The model will automatically fall back to CPU
- Or close other GPU applications

### "Model download stuck"
- First run downloads ~244MB from Hugging Face
- Check your internet connection
- May take a few minutes

### "Transcription failed"
- Check the error message in the console
- Check `transcription_error` column in database
- Ensure video file is valid and accessible

## Performance Tips

1. **Use GPU if available**: Much faster (10-30x)
2. **Batch processing**: Process multiple videos at once
3. **Model caching**: Model stays loaded between transcriptions
4. **Audio compression**: Large videos are automatically compressed

## Expected Processing Times

| Video Length | CPU Time | GPU Time |
|-------------|----------|----------|
| 1 minute    | 30-60s   | 5-10s    |
| 5 minutes   | 2-4 min  | 20-40s   |
| 10 minutes  | 5-8 min  | 1-2 min  |

## System Requirements

- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: ~300MB for model + temp files
- **GPU**: Optional (NVIDIA with CUDA for faster processing)
- **OS**: Windows, Mac, or Linux
- **Python**: 3.8 or higher
