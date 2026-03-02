# pytest configuration for resume parser tests
import os
# Disable GPT calls in tests (use mock/test mode)
os.environ["TEST_MODE"] = "true"
