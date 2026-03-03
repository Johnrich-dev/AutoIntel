-- Create storage bucket for applicant video assessments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('applicant-videos', 'applicant-videos', true, 104857600, ARRAY['video/webm', 'video/mp4', 'video/quicktime', 'video/x-msvideo']);

-- Allow anyone to upload videos (access token based auth)
CREATE POLICY "Anyone can upload videos" ON storage.objects
FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'applicant-videos'
);

-- Allow public read access to applicant videos
CREATE POLICY "Public read access to applicant videos" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'applicant-videos');

-- Allow anyone to update videos (access token based auth)
CREATE POLICY "Anyone can update videos" ON storage.objects
FOR UPDATE TO anon, authenticated
USING (bucket_id = 'applicant-videos')
WITH CHECK (
  bucket_id = 'applicant-videos'
);

-- Allow anyone to delete videos (access token based auth)
CREATE POLICY "Anyone can delete videos" ON storage.objects
FOR DELETE TO anon, authenticated
USING (bucket_id = 'applicant-videos');
