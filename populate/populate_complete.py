#!/usr/bin/env python3
"""
Complete Analytics Population Workflow

1. Creates a test client and gets API key
2. For each dataset:
   - POST /v1/text/summary with original text (generates summary, stores metadata)
   - POST /v1/text/summary/correction with corrected text (triggers analytics)

Requirements:
    pip install requests python-dotenv

Environment Variables:
    MEDSUM_API_URL - medsum-api base URL (default: https://medsum.carasent.dev)
    MEDSUM_ADMIN_API_KEY - Admin API key for creating client (required)
    UPLOAD_DELAY - Delay between operations in seconds (default: 2.0)
    REQUEST_TIMEOUT - Request timeout in seconds (default: 60)

Usage:
    python populate_complete.py
"""

import os
import json
import time
import requests
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
MEDSUM_API_URL = os.getenv('MEDSUM_API_URL', 'https://medsum.carasent.dev')
MEDSUM_ADMIN_API_KEY = os.getenv('MEDSUM_ADMIN_API_KEY', '')
UPLOAD_DELAY = float(os.getenv('UPLOAD_DELAY', '2.0'))
REQUEST_TIMEOUT = int(os.getenv('REQUEST_TIMEOUT', '60'))
DATASET_DIR = Path(__file__).parent / 'dataset-sv'

# Dummy journal form (required by API)
DUMMY_JOURNAL_FORM = json.dumps({
    "title": "",
    "content": "",
    "notes": ""
})


class PopulateWorkflow:
    def __init__(self, api_url):
        self.api_url = api_url.rstrip('/')
        self.admin_session = requests.Session()
        self.client_session = requests.Session()
        self.client_api_key = None
        
        if MEDSUM_ADMIN_API_KEY:
            self.admin_session.headers.update({'X-API-Key': MEDSUM_ADMIN_API_KEY})
    
    def log(self, message, level='INFO'):
        """Console logging with colors"""
        colors = {
            'INFO': '\033[94m',
            'SUCCESS': '\033[92m',
            'ERROR': '\033[91m',
            'WARNING': '\033[93m',
            'STEP': '\033[95m'
        }
        reset = '\033[0m'
        timestamp = datetime.now().strftime('%H:%M:%S')
        color = colors.get(level, '')
        print(f"{color}[{timestamp}] {message}{reset}")
    
    def create_client(self):
        """Step 1: Create a test client and get API key"""
        self.log("STEP 1: Creating test client...", 'STEP')
        
        try:
            url = f"{self.api_url}/internal/auth/client"
            payload = {
                'name': f'populate-test-{int(time.time())}',
                'description': 'Test client for analytics population'
            }
            
            response = self.admin_session.post(url, json=payload, timeout=REQUEST_TIMEOUT)
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.client_api_key = data.get('apiKey')
                client_id = data.get('id')
                client_name = data.get('name')
                
                if not self.client_api_key:
                    self.log("  ✗ No API key in response", 'ERROR')
                    return False
                
                self.log(f"  ✓ Client created: {client_name} (ID: {client_id})", 'SUCCESS')
                self.log(f"  ✓ API Key: {self.client_api_key[:20]}...", 'SUCCESS')
                
                # Configure client session
                self.client_session.headers.update({'X-API-Key': self.client_api_key})
                return True
            else:
                self.log(f"  ✗ Client creation failed: {response.status_code} - {response.text}", 'ERROR')
                return False
                
        except Exception as e:
            self.log(f"  ✗ Error creating client: {e}", 'ERROR')
            return False
    
    def generate_summary(self, application, journal, original_text):
        """Step 2a: Call /v1/text/summary to generate and store summary"""
        try:
            url = f"{self.api_url}/v1/text/summary"
            payload = {
                'application': application,
                'journal': journal,
                'journalForm': DUMMY_JOURNAL_FORM,
                'text': original_text,
                'language': 'se'
            }
            
            self.log(f"  → Generating summary (journal {journal})...", 'INFO')
            response = self.client_session.post(url, json=payload, timeout=REQUEST_TIMEOUT)
            
            if response.status_code in [200, 201]:
                self.log(f"  ✓ Summary generated and stored", 'SUCCESS')
                return True
            else:
                self.log(f"  ✗ Summary failed: {response.status_code} - {response.text}", 'ERROR')
                return False
                
        except Exception as e:
            self.log(f"  ✗ Summary error: {e}", 'ERROR')
            return False
    
    def submit_correction(self, application, journal, corrected_text):
        """Step 2b: Call /v1/text/summary/correction to trigger analytics"""
        try:
            url = f"{self.api_url}/v1/text/summary/correction"
            payload = {
                'application': application,
                'journal': journal,
                'text': corrected_text
            }
            
            self.log(f"  → Submitting correction (journal {journal})...", 'INFO')
            response = self.client_session.post(url, json=payload, timeout=REQUEST_TIMEOUT)
            
            if response.status_code in [200, 201]:
                self.log(f"  ✓ Correction submitted (analytics triggered)", 'SUCCESS')
                return True
            else:
                self.log(f"  ✗ Correction failed: {response.status_code} - {response.text}", 'ERROR')
                return False
                
        except Exception as e:
            self.log(f"  ✗ Correction error: {e}", 'ERROR')
            return False
    
    def process_dataset(self, job_id, index):
        """Process a single dataset: summary -> correction"""
        self.log(f"\n📄 [{index}] Processing: {job_id}", 'INFO')
        
        # Extract journal number
        application = 'populate'
        journal_num = int(job_id.split('-')[-1])
        
        # New folder structure: dataset-sv/job-XXX/
        job_folder = DATASET_DIR / job_id
        original_file = job_folder / 'original.txt'
        summary_file = job_folder / 'summary.txt'
        
        # Check files exist
        if not original_file.exists() or not summary_file.exists():
            self.log(f"  ✗ Files not found in {job_folder}", 'ERROR')
            return False
        
        try:
            # Read file contents
            with open(original_file, 'r', encoding='utf-8') as f:
                original_text = f.read()
            
            with open(summary_file, 'r', encoding='utf-8') as f:
                corrected_text = f.read()
            
            # Step 2a: Generate summary
            if not self.generate_summary(application, journal_num, original_text):
                return False
            
            # Wait between operations
            time.sleep(UPLOAD_DELAY)
            
            # Step 2b: Submit correction
            if not self.submit_correction(application, journal_num, corrected_text):
                return False
            
            return True
            
        except Exception as e:
            self.log(f"  ✗ Error: {e}", 'ERROR')
            return False
    job datasets in folder structure"""
        jobs = []
        
        # Find all job-XXX folders
        for job_folder in sorted(DATASET_DIR.glob('job-*')):
            if job_folder.is_dir():
                jobs.append(job_folder.name)
        
        return s.append(job_id)
        
        return summary_jobs
    
    def run(self):
        """Execute complete workflow"""
        self.log(f"\n{'='*70}")
        self.log(f"COMPLETE ANALYTICS POPULATION WORKFLOW")
        self.log(f"API: {self.api_url}")
        self.log(f"Dataset: {DATASET_DIR}")
        self.log(f"{'='*70}\n")
        
        # Step 1: Create client
        if not self.create_client():
            self.log("\n❌ Failed to create client. Aborting.", 'ERROR')
            return False
        
        time.sleep(1)
        
        # Discover datasets
        datasets = self.discover_datasets()
        self.log(f"\n{'─'*70}")
        self.log(f"STEP 2: Processing {len(datasets)} datasets", 'STEP')
        self.log(f"{'─'*70}")
        
        if not datasets:
            self.log("\n⚠️  No datasets found!", 'WARNING')
            return False
        
        # Process each dataset
        total_success = 0
        total_errors = 0
        
        for index, job_id in enumerate(datasets, 1):
            if self.process_dataset(job_id, index):
                total_success += 1
            else:
                total_errors += 1
            
            # Rate limiting between datasets
            if index < len(datasets):
                time.sleep(UPLOAD_DELAY)
        
        # Summary
        self.log(f"\n{'='*70}")
        if total_errors == 0:
            self.log(f"✅ ALL COMPLETE: {total_success}/{len(datasets)} datasets processed!", 'SUCCESS')
        else:
            self.log(f"⚠️  COMPLETED: {total_success} successful, {total_errors} failed", 'WARNING')
        
        self.log(f"\n📊 Analytics should now contain {total_success} summary records")
        self.log(f"🔑 Client API Key: {self.client_api_key}")
        self.log(f"{'='*70}\n")
        
        return total_errors == 0


def main():
    print("""
╔══════════════════════════════════════════════════════════════════╗
║        Complete Analytics Population Workflow                    ║
║  1. Create client → 2. Generate summaries → 3. Trigger analytics ║
╚══════════════════════════════════════════════════════════════════╝
    """)
    
    # Validate config
    if not MEDSUM_ADMIN_API_KEY:
        print("❌ ERROR: MEDSUM_ADMIN_API_KEY not set (required for creating client)")
        print("   Set MEDSUM_ADMIN_API_KEY in .env file")
        print("   This is the admin API key from medsum-admin")
        return 1
    
    print(f"Configuration:")
    print(f"  API URL:           {MEDSUM_API_URL}")
    print(f"  Admin API Key:     Configured")
    print(f"  Operation Delay:   {UPLOAD_DELAY}s")
    print(f"  Timeout:           {REQUEST_TIMEOUT}s")
    print(f"  Dataset Dir:       {DATASET_DIR}")
    print(f"\n📋 Workflow:")
    print(f"  Step 1: POST /internal/auth/client (create test client)")
    print(f"  Step 2: For each dataset:")
    print(f"          → POST /v1/text/summary (generate + store metadata)")
    print(f"          → POST /v1/text/summary/correction (trigger analytics)")
    print()
    
    workflow = PopulateWorkflow(MEDSUM_API_URL)
    
    try:
        success = workflow.run()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⚠️  Workflow cancelled by user")
        return 1
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit(main())
