import json
import os
import sys

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(current_dir, "gis_tools_catalog.json")
    md_path = os.path.join(current_dir, "gis_tools_catalog.md")

    if not os.path.exists(json_path):
        print(f"Error: JSON catalog not found at {json_path}", file=sys.stderr)
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    markdown_content = []
    markdown_content.append("# GIS Tools Catalog")
    markdown_content.append("")
    markdown_content.append("> [!NOTE]")
    markdown_content.append("> This document is dynamically generated from the source-of-truth [gis_tools_catalog.json](file://" + json_path + ").")
    markdown_content.append("> Run `python3 generate_markdown_catalog.py` to synchronize any updates.")
    markdown_content.append("")
    markdown_content.append("## Quick Reference Table")
    markdown_content.append("")
    markdown_content.append("| Function Name | Brief Description |")
    markdown_content.append("|---|---|")
    
    for tool in catalog:
        brief = tool["documentation"].split(".")[0] + "."
        markdown_content.append(f"| [`{tool['function_name']}`](#{tool['function_name'].lower().replace('_', '-')}) | {brief} |")
    
    markdown_content.append("")
    markdown_content.append("---")
    markdown_content.append("")

    for tool in catalog:
        markdown_content.append(f"### `{tool['function_name']}`")
        markdown_content.append("")
        markdown_content.append(f"**Description:** {tool['documentation']}")
        markdown_content.append("")
        
        markdown_content.append("**Inputs:**")
        markdown_content.append("| Argument | Type |")
        markdown_content.append("|---|---|")
        for arg, arg_type in tool["inputs"].items():
            markdown_content.append(f"| `{arg}` | `{arg_type}` |")
        markdown_content.append("")

        markdown_content.append("**Outputs:**")
        for output in tool["outputs"]:
            markdown_content.append(f"- `{output}`")
        markdown_content.append("")

        markdown_content.append("**Use Cases:**")
        for uc in tool["use_cases"]:
            markdown_content.append(f"- *{uc}*")
        markdown_content.append("")

        markdown_content.append("**Example User Questions:**")
        for q in tool["example_user_questions"]:
            markdown_content.append(f'- "{q}"')
        markdown_content.append("")
        markdown_content.append("---")
        markdown_content.append("")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(markdown_content))

    print(f"Success! Generated Markdown catalog at: {md_path}")

if __name__ == "__main__":
    main()
