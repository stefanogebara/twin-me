"""
DPO Job Status Checker
======================
Usage: python scripts/check_dpo_status.py [job_id]

If no job_id is passed, reads DPO_JOB_ID from the environment.
"""

import os
import sys
import together


def require_env(name):
    value = os.getenv(name)
    if not value:
        print(f"ERROR: Required environment variable {name} is not set.")
        sys.exit(1)
    return value

def main():
    together_api_key = require_env("TOGETHER_API_KEY")
    job_id = sys.argv[1] if len(sys.argv) > 1 else os.getenv("DPO_JOB_ID")
    if not job_id:
        print("ERROR: Pass a job_id or set DPO_JOB_ID.")
        sys.exit(1)
    client = together.Together(api_key=together_api_key)

    job = client.fine_tuning.retrieve(job_id)

    print(f"Job ID    : {job.id}")
    print(f"Status    : {job.status}")
    print(f"Model     : {job.model}")

    if hasattr(job, 'output_name') and job.output_name:
        print(f"Output    : {job.output_name}")

    if hasattr(job, 'events') and job.events:
        print("\nRecent events:")
        for ev in job.events[-5:]:
            print(f"  [{ev.created_at}] {ev.message}")

    if job.status == "completed":
        print(f"\nDone! Update personalityOracle.js with model: {job.output_name}")
    elif job.status == "failed":
        print(f"\nFailed. Check events above for details.")
    else:
        print(f"\nStill running. Poll again in a few minutes.")

if __name__ == "__main__":
    main()
