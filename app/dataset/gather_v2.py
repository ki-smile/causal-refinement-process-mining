# -*- coding: utf-8 -*-
"""
Created on Tue May 12 13:51:40 2026

@author: edillu
"""


import sqlite3
import pandas as pd

# 1. Configuration
DB_NAME = 'ckd_raw_data.db'
OUTPUT_CSV = 'reconstructed_ckd_event_log.csv'

def extract_event_log():
    print(f"Connecting to database: {DB_NAME}...")
    
    try:
        # Establish a connection to the SQLite database
        conn = sqlite3.connect(DB_NAME)
        
        # 2. The Gather Query
        # We UNION the two tables that hold the original events.
        # - We JOIN the Patients table to retrieve the original "group" column.
        # - We filter Lab_Results to test_type IS NULL (because "eGFR" became NaN) 
        #   and value <= 60 to filter out the synthetically injected baseline labs.
        sql_query = """
        SELECT 
            l.patient_id AS case_id,
            'CKD outcomes' AS activity,
            l.result_time AS timestamp,
            p."group",
            p."deletdat",
            'complete' AS lifecycle
        FROM Lab_Results l
        JOIN Patients p ON l.patient_id = p.patient_id
        WHERE l.test_type IS NULL AND l.value <= 60

        UNION ALL

        SELECT 
            e.patient_id AS case_id,
            e.encounter_type AS activity,
            e.admission_date AS timestamp,
            p."group",
            p."deletdat",
            e.lifecycle
        FROM Encounters e
        JOIN Patients p ON e.patient_id = p.patient_id

        ORDER BY case_id, timestamp;
        """
        
        print("Executing Gather Query and reconstructing event log...")
        
        # 3. Execute query and load directly into a pandas DataFrame
        df = pd.read_sql_query(sql_query, conn)
        
        # 4. Export the reconstructed DataFrame to a CSV
        print(f"Exporting data to {OUTPUT_CSV}...")
        df['row'] = df.index
        df['seq'] = df['activity'].map({'Drug use index': 1, 'Study end': 999, 'CKD outcomes': 2, 'Heart Disease': 3, 'Death': 4})
        df.to_csv(OUTPUT_CSV, index=False)
        
        print(f"Success! Reconstructed event log saved as '{OUTPUT_CSV}'.")
        print(f"Total events recovered: {len(df)}")
        
    except sqlite3.Error as e:
        print(f"An error occurred with the database: {e}")
    finally:
        # Always close the connection
        if 'conn' in locals() and conn:
            conn.close()
    
    
    
    return df

if __name__ == "__main__":
    reconstructed = extract_event_log()