import json
import os
import sys

def load_catalog(filepath):
    """Load the GIS tools catalog from JSON."""
    if not os.path.exists(filepath):
        print(f"Error: Catalog file not found at {filepath}", file=sys.stderr)
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def search_catalog(catalog, query):
    """
    Search the catalog for matching GIS tools.
    Returns matches sorted by relevance score.
    """
    query_terms = [term.lower() for term in query.split() if len(term) > 2]
    if not query_terms:
        # Default to whole string match if terms are too short
        query_terms = [query.lower()]

    results = []
    for tool in catalog:
        score = 0
        matches = []
        
        # 1. Check function_name (highest weight)
        func_name = tool["function_name"].lower()
        for term in query_terms:
            if term in func_name:
                score += 10
                matches.append(f"Function Name: '{term}'")

        # 2. Check documentation
        doc = tool["documentation"].lower()
        for term in query_terms:
            if term in doc:
                score += 3
                matches.append(f"Documentation: '{term}'")

        # 3. Check use cases
        for uc in tool["use_cases"]:
            uc_lower = uc.lower()
            for term in query_terms:
                if term in uc_lower:
                    score += 5
                    matches.append(f"Use case '{uc}': '{term}'")

        # 4. Check example user questions
        for eq in tool["example_user_questions"]:
            eq_lower = eq.lower()
            for term in query_terms:
                if term in eq_lower:
                    score += 2
                    matches.append(f"Example question: '{term}'")

        if score > 0:
            results.append({
                "tool": tool,
                "score": score,
                "matches": list(set(matches))
            })

    # Sort results by score in descending order
    results.sort(key=lambda x: x["score"], reverse=True)
    return results

def main():
    if len(sys.argv) < 2:
        print("Usage: python search_catalog.py <search_query>")
        print("Example: python search_catalog.py \"hospital heat exposure\"")
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    current_dir = os.path.dirname(os.path.abspath(__file__))
    catalog_path = os.path.join(current_dir, "gis_tools_catalog.json")
    
    catalog = load_catalog(catalog_path)
    if not catalog:
        sys.exit(1)

    print(f"Searching catalog for: '{query}'...\n")
    search_results = search_catalog(catalog, query)

    if not search_results:
        print("No matching GIS tools found.")
        sys.exit(0)

    print(f"Found {len(search_results)} matching tools:\n")
    for i, res in enumerate(search_results, 1):
        tool = res["tool"]
        print(f"{i}. Tool: {tool['function_name']} (Score: {res['score']})")
        print(f"   Documentation: {tool['documentation']}")
        print(f"   Inputs: {json.dumps(tool['inputs'], indent=2).replace(chr(10), chr(10) + '   ')}")
        print(f"   Outputs: {', '.join(tool['outputs'])}")
        print(f"   Matched on: {', '.join(res['matches'])}")
        print("-" * 60)

if __name__ == "__main__":
    main()
