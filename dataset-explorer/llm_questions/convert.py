import os
import json
import pandas as pd

input_parquet_path ="/Users/gregorylazatin/.unsloth/studio/assets/datasets/recipes/recipe_test-dataset-1/parquet-files/batch_00000.parquet"
output_csv_path = "pacific_islands_flattened.csv"
print("Reading raw Parquet dataset...")
df = pd.read_parquet(input_parquet_path)

if "llm_structured_1" not in df.columns:
    raise ValueError("Could not find the 'llm_structured_1' column in the Parquet file.")

flattened_rows = []

print("Extracting and flattening pre-parsed dictionary records...")
for index, row in df.iterrows():
    cell_data = row["llm_structured_1"]
    source_file = row.get("source_file", "Unknown")
    
    # Skip completely missing entries safely
    if pd.isna(cell_data) or cell_data is None:
        continue
        
    # Check if the cell is already a dictionary
    if isinstance(cell_data, dict):
        json_data = cell_data.copy()
        json_data["source_file"] = source_file
        
        # --- AUTOMATED CLEANING FILTER ---
        # Exclude rows where the model flagged it as irrelevant or used our placeholder
        if json_data.get("is_relevant") is False or json_data.get("non_expert_policy_maker_question") == "SKIP":
            continue
            
        flattened_rows.append(json_data)
        
    # Fallback in case some rows were written as strings
    elif isinstance(cell_data, str):
        if not cell_data.strip():
            continue
        try:
            import json
            json_data = json.loads(cell_data)
            json_data["source_file"] = source_file
            
            # --- AUTOMATED CLEANING FILTER ---
            if json_data.get("is_relevant") is False or json_data.get("non_expert_policy_maker_question") == "SKIP":
                continue
                
            flattened_rows.append(json_data)
        except json.JSONDecodeError:
            print(f"Skipping row {index}: Row data string is not valid JSON.")
            continue
    else:
        print(f"Skipping row {index}: Unexpected data type {type(cell_data)}")
        continue

# 3. Build the new flattened DataFrame
df_flat = pd.DataFrame(flattened_rows)

# 4. Standardize column order matching your JSON schema headers
columns_order = [
    "source_file",
    "is_relevant",
    "non_expert_policy_maker_question",
    "expert_translation_analytical_query",
    "follow_up_needed",
    "non_technical_follow_up_questions",
    "expert_approach",
    "visual"
]

# Only index columns that successfully generated to prevent KeyErrors
existing_columns = [col for col in columns_order if col in df_flat.columns]

if len(df_flat) > 0:
    df_flat = df_flat[existing_columns]
    
    # 5. Export directly to a clean CSV
    df_flat.to_csv(output_csv_path, index=False, encoding="utf-8")
    print(f"Success! Cleaned dataset exported to: {output_csv_path}")
    print(f"Total structured rows processed and saved: {len(df_flat)}")
else:
    print("Optimization note: No relevant rows were found after applying the cleaning step. The CSV file was not written.")