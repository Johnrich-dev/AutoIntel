-- Create storage bucket for applicant photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('applicant-photos', 'applicant-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

-- Allow applicants to upload their own photo
CREATE POLICY "Applicants can upload photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'applicant-photos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to applicant photos
CREATE POLICY "Public read access to applicant photos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'applicant-photos');

-- Allow applicants to update their own photo
CREATE POLICY "Applicants can update own photos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'applicant-photos')
WITH CHECK (
  bucket_id = 'applicant-photos' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
