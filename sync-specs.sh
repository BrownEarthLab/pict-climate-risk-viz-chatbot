#!/bin/bash

# ==============================================================================
# CONFIGURATION
# ==============================================================================
# Define the absolute or relative paths to your active project and your spec vault
PROJ_DIR="/workspaces/global-sandbox/projects/pict-climate-risk-viz-chatbot"
SPEC_DIR="/workspaces/global-sandbox/specs/pict-climate-risk-viz-chatbot"

# Target directories to track and sync
TARGETS=(".agent" ".opencode" "openspec")

# ==============================================================================
# ENGINE LOGIC
# ==============================================================================
case "$1" in
    pull)
        echo "🔄 Syncing spec vault with Git upstream first..."
        if [ -d "$SPEC_DIR/.git" ]; then
            cd "$SPEC_DIR" || exit
            # Fetch latest remote changes and merge them cleanly inside the spec repo
            git pull origin main --quiet
            echo " ✅ Spec vault is now up-to-date with HEAD."
            cd - > /dev/null || exit
        fi

        echo "🚚 Transporting specifications into active project workspace..."
        for item in "${TARGETS[@]}"; do
            # SAFETY CHECK: Detect if local workspace files are newer than the vault files
            if [ -d "$PROJ_DIR/$item" ] && [ -d "$SPEC_DIR/$item" ]; then
                LOCAL_NEWER=$(find "$PROJ_DIR/$item" -type f -newer "$SPEC_DIR/$item" 2>/dev/null)
                
                if [ -n "$LOCAL_NEWER" ]; then
                    echo " 🛑 WARNING: Your local project files in '$item' are newer than the spec vault!"
                    echo "    Pulling now will completely overwrite your active session changes."
                    read -p "    Do you want to force overwrite local changes? (y/N): " CONFIRM
                    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
                        echo " ❌ Pull aborted for '$item' to protect your local modifications."
                        continue
                    fi
                fi
            fi

            # Execute the clean copy if path exists in vault
            if [ -d "$SPEC_DIR/$item" ]; then
                rm -rf "$PROJ_DIR/$item"
                cp -R "$SPEC_DIR/$item" "$PROJ_DIR/"
                echo " ✅ Loaded $item into project workspace."
            else
                echo " ⚠️  Skipping $item (Not found in spec vault)"
            fi
        done
        echo "🚀 Sync complete. Ready for OpenCode session."
        ;;
        
    push)
        echo "💾 Saving project specifications back to spec git vault..."
        mkdir -p "$SPEC_DIR"
        
        for item in "${TARGETS[@]}"; do
            if [ -d "$PROJ_DIR/$item" ]; then
                # Clean old spec instance before saving to prevent directory nesting bugs
                rm -rf "$SPEC_DIR/$item"
                cp -R "$PROJ_DIR/$item" "$SPEC_DIR/"
                echo " ✅ Cached $item to vault."
            else
                echo " ⚠️  Skipping $item (Not found in active project workspace)"
            fi
        done
        
        echo "📜 Initializing automated Git commit tracking..."
        cd "$SPEC_DIR" || exit
        
        # Auto-initialize the spec repo if it doesn't have a Git identity yet
        if [ ! -d ".git" ]; then
            echo " 📁 Initializing new Git repository inside specs folder..."
            git init -b main
        fi
        
        # Generate clean human-readable timestamp
        TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
        
        # Stage files and check for structural updates
        git add -A
        
        if git diff-index --quiet HEAD -- 2>/dev/null; then
            echo " 😎 No new modifications detected. Spec vault is already up to date!"
        else
            git commit -m "Sync specs: $TIMESTAMP"
            echo " 🔒 Vault committed securely with timestamp: [$TIMESTAMP]"
        fi
        ;;
        
    *)
        echo "Error: Invalid argument."
        echo "Usage: $0 {pull|push}"
        exit 1
        ;;
esac