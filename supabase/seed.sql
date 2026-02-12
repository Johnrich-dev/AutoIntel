-- Insert test data for prototype
INSERT INTO applicants (email, name, position, access_token, access_expires_at, rules_accepted, rules_accepted_at, created_at)
VALUES
  ('john.doe@example.com', 'John Doe', 'Software Engineer', 'token_john_123', now() + interval '2 days', true, now(), now()),
  ('jane.smith@example.com', 'Jane Smith', 'Product Manager', 'token_jane_456', now() + interval '2 days', false, NULL, now()),
  ('bob.wilson@example.com', 'Bob Wilson', 'Data Scientist', 'token_bob_789', now() + interval '2 days', false, NULL, now())
ON CONFLICT (access_token) DO NOTHING;