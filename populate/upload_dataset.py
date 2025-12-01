#!/usr/bin/env python3
"""
Analytics Dataset Uploader

Uploads dataset files from the dataset/ folder to medsum analytics API.
Works with production endpoint (https://medsum.carasent.dev/analytics).

Dataset Structure:
- Transcription: job-XXX_transcribed.txt + job-XXX_corrected.txt
- Summary: sum-XXX_original.txt + sum-XXX_summary.txt + sum-XXX_metadata.json

Requirements:
    pip install requests python-dotenv

Environment Variables:
    ANALYTICS_API_URL - Analytics API base URL (default: https://medsum.carasent.dev/analytics)
    ANALYTICS_API_KEY - Optional API key for authentication
    UPLOAD_DELAY - Delay between uploads in seconds (default: 0.5)
    REQUEST_TIMEOUT - Request timeout in seconds (default: 30)

Usage:
    python upload_dataset.py
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
ANALYTICS_API_URL = os.getenv('ANALYTICS_API_URL', 'https://medsum.carasent.dev/analytics')
ANALYTICS_API_KEY = os.getenv('ANALYTICS_API_KEY', '')
UPLOAD_DELAY = float(os.getenv('UPLOAD_DELAY', '0.5'))
REQUEST_TIMEOUT = int(os.getenv('REQUEST_TIMEOUT', '30'))
DATASET_DIR = Path(__file__).parent / 'dataset'


class DatasetUploader:
    def __init__(self, api_url):
        self.api_url = api_url.rstrip('/')
        self.session = requests.Session()
        
        # Set up headers
        headers = {
            'User-Agent': 'MedsumDatasetUploader/1.0'
        }
        
        # Add API key if configured
        if ANALYTICS_API_KEY:
            headers['X-API-Key'] = ANALYTICS_API_KEY
            self.log("API Key configured", 'INFO')
        
        self.session.headers.update(headers)
    
    def log(self, message, level='INFO'):
        """Console logging with colors"""
        colors = {
            'INFO': '\033[94m',
            'SUCCESS': '\033[92m',
            'ERROR': '\033[91m',
            'WARNING': '\033[93m'
        }
        reset = '\033[0m'
        timestamp = datetime.now().strftime('%H:%M:%S')
        color = colors.get(level, '')
        print(f"{color}[{timestamp}] {message}{reset}")
    
    def upload_transcription(self, job_id):
        """Upload transcription dataset"""
        self.log(f"📝 Processing transcription: {job_id}")
        
        transcribed_file = DATASET_DIR / f"{job_id}_transcribed.txt"
        corrected_file = DATASET_DIR / f"{job_id}_corrected.txt"
        
        # Check files exist
        if not transcribed_file.exists() or not corrected_file.exists():
            self.log(f"  ✗ Files not found for {job_id}", 'ERROR')
            return False
        
        try:
            # Upload files
            upload_url = f"{self.api_url}/transcript-analysis/upload"
            
            with open(transcribed_file, 'rb') as trans_f, open(corrected_file, 'rb') as corr_f:
                files = {
                    'transcription': (transcribed_file.name, trans_f, 'text/plain'),
                    'corrected': (corrected_file.name, corr_f, 'text/plain')
                }
                data = {'job': job_id}
                
                response = self.session.post(upload_url, files=files, data=data, timeout=30)
                
                if response.status_code in [200, 201]:
                    self.log(f"  ✓ Uploaded files", 'SUCCESS')
                else:
                    self.log(f"  ✗ Upload failed: {response.status_code} - {response.text}", 'ERROR')
                    return False
            
            # Trigger analysis
            time.sleep(UPLOAD_DELAY)
            trigger_url = f"{self.api_url}/transcript-analysis/trigger/{job_id}"
            response = self.session.post(trigger_url, timeout=REQUEST_TIMEOUT)
            
            if response.status_code in [200, 201]:
                self.log(f"  ✓ Triggered analysis", 'SUCCESS')
                return True
            else:
                self.log(f"  ✗ Trigger failed: {response.status_code} - {response.text}", 'ERROR')
                return False
                
        except Exception as e:
            self.log(f"  ✗ Error: {e}", 'ERROR')
            return False
    
    def upload_summary(self, job_id):
        """Upload summary dataset with metadata"""
        self.log(f"📄 Processing summary: {job_id}")
        
        original_file = DATASET_DIR / f"{job_id}_original.txt"
        summary_file = DATASET_DIR / f"{job_id}_summary.txt"
        metadata_file = DATASET_DIR / f"{job_id}_metadata.json"
        
        # Check files exist
        if not original_file.exists() or not summary_file.exists():
            self.log(f"  ✗ Files not found for {job_id}", 'ERROR')
            return False
        
        # Load metadata
        metadata = {}
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
                self.log(f"  📋 Loaded metadata: model={metadata.get('modelId')}, client={metadata.get('clientId')}", 'INFO')
        else:
            self.log(f"  ⚠️  No metadata file found, using defaults", 'WARNING')
        
        try:
            # Upload files
            upload_url = f"{self.api_url}/summary-analysis/upload"
            
            with open(original_file, 'rb') as orig_f, open(summary_file, 'rb') as summ_f:
                files = {
                    'originalFile': (original_file.name, orig_f, 'text/plain'),
                    'correctedFile': (summary_file.name, summ_f, 'text/plain')
                }
                data = {'job': job_id}
                
                response = self.session.post(upload_url, files=files, data=data, timeout=REQUEST_TIMEOUT)
                
                if response.status_code in [200, 201]:
                    self.log(f"  ✓ Uploaded files", 'SUCCESS')
                else:
                    self.log(f"  ✗ Upload failed: {response.status_code} - {response.text}", 'ERROR')
                    return False
            
            # Trigger analysis with metadata
            time.sleep(UPLOAD_DELAY)
            trigger_url = f"{self.api_url}/summary-analysis/trigger/{job_id}"
            
            # Prepare metadata payload
            trigger_payload = {
                "job": job_id,
                "bucket": "medsum-data",
                "originalFile": f"{job_id}/{job_id}_original.txt",
                "summaryFile": f"{job_id}/{job_id}_summary.txt",
                "jobId": metadata.get('jobId', f"dataset-{job_id}"),
                "modelId": metadata.get('modelId', 'gpt-4o'),
                "promptId": metadata.get('promptId'),
                "clientId": metadata.get('clientId'),
                "explanationIds": metadata.get('explanationIds', [])
            }
            
            response = self.session.post(
                trigger_url,
                json=trigger_payload,
                headers={'Content-Type': 'application/json'},
                timeout=REQUEST_TIMEOUT
            )
            
            if response.status_code in [200, 201]:
                model_info = f"(model: {trigger_payload['modelId']}, client: {trigger_payload['clientId']})"
                self.log(f"  ✓ Triggered analysis {model_info}", 'SUCCESS')
                return True
            else:
                self.log(f"  ✗ Trigger failed: {response.status_code} - {response.text}", 'ERROR')
                return False
                
        except Exception as e:
            self.log(f"  ✗ Error: {e}", 'ERROR')
            return False
    
    def discover_datasets(self):
        """Discover all datasets in the dataset folder"""
        transcription_jobs = set()
        summary_jobs = set()
        
        for file in DATASET_DIR.glob('*.txt'):
            if file.stem.endswith('_transcribed'):
                job_id = file.stem.replace('_transcribed', '')
                transcription_jobs.add(job_id)
            elif file.stem.endswith('_original'):
                job_id = file.stem.replace('_original', '')
                summary_jobs.add(job_id)
        
        return sorted(transcription_jobs), sorted(summary_jobs)
    
    def upload_all(self):
        """Upload all datasets"""
        self.log(f"\n{'='*60}")
        self.log(f"Analytics Dataset Uploader")
        self.log(f"API: {self.api_url}")
        self.log(f"Dataset: {DATASET_DIR}")
        self.log(f"{'='*60}\n")
        
        # Discover datasets
        transcription_jobs, summary_jobs = self.discover_datasets()
        
        self.log(f"Found {len(transcription_jobs)} transcription datasets")
        self.log(f"Found {len(summary_jobs)} summary datasets\n")
        
        if not transcription_jobs and not summary_jobs:
            self.log("No datasets found!", 'ERROR')
            return
        
        total_success = 0
        total_errors = 0
        
        # Upload transcription datasets
        if transcription_jobs:
            self.log(f"\n{'─'*60}")
            self.log("TRANSCRIPTION DATASETS")
            self.log(f"{'─'*60}\n")
            
            for job_id in transcription_jobs:
                if self.upload_transcription(job_id):
                    total_success += 1
                else:
                    total_errors += 1
                time.sleep(UPLOAD_DELAY)  # Rate limiting
        
        # Upload summary datasets
        if summary_jobs:
            self.log(f"\n{'─'*60}")
            self.log("SUMMARY DATASETS")
            self.log(f"{'─'*60}\n")
            
            for job_id in summary_jobs:
                if self.upload_summary(job_id):
                    total_success += 1
                else:
                    total_errors += 1
                time.sleep(UPLOAD_DELAY)  # Rate limiting
        
        # Summary
        self.log(f"\n{'='*60}")
        if total_errors == 0:
            self.log(f"✓ ALL COMPLETE: {total_success} datasets uploaded successfully!", 'SUCCESS')
        else:
            self.log(f"⚠️  COMPLETED: {total_success} successful, {total_errors} failed", 'WARNING')
        self.log(f"{'='*60}\n")


def main():
    print("""
╔════════════════════════════════════════════════════════════╗
║           Analytics Dataset Uploader                       ║
║  Uploads transcription + summary datasets to analytics     ║
╚════════════════════════════════════════════════════════════╝
    """)
    
    print(f"Configuration:")
    print(f"  API URL:       {ANALYTICS_API_URL}")
    print(f"  API Key:       {'Configured' if ANALYTICS_API_KEY else 'Not set'}")
    print(f"  Upload Delay:  {UPLOAD_DELAY}s")
    print(f"  Timeout:       {REQUEST_TIMEOUT}s")
    print(f"  Dataset Dir:   {DATASET_DIR}")
    print()
    
    uploader = DatasetUploader(ANALYTICS_API_URL)
    
    try:
        uploader.upload_all()
    except KeyboardInterrupt:
        print("\n\n⚠️  Upload cancelled by user")
        return 1
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())
