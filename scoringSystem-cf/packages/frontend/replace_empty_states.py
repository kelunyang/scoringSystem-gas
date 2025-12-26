#!/usr/bin/env python3
"""
Batch replace all empty state divs with the EmptyState component
"""

import re
import os
from pathlib import Path

# Map of empty state patterns to EmptyState component replacements
replacements = {
    # EmailLogsManagement.vue
    'admin/EmailLogsManagement.vue': [
        {
            'old': '''      <div v-if="filteredLogs.length === 0 && !loading" class="no-data">
        <i class="fas fa-inbox"></i>
        <p>沒有找到符合條件的郵件日誌</p>
      </div>''',
            'new': '''      <EmptyState
        v-if="filteredLogs.length === 0 && !loading"
        :icons="['fa-inbox', 'fa-envelope-open']"
        title="沒有找到符合條件的郵件日誌"
        :compact="true"
      />'''
        }
    ],

    # NotificationManagement.vue
    'admin/NotificationManagement.vue': [
        {
            'old': '''      <div v-if="filteredNotifications.length === 0 && !loading" class="no-data">
        <i class="fas fa-bell-slash"></i>
        <p>沒有找到符合條件的通知</p>
      </div>''',
            'new': '''      <EmptyState
        v-if="filteredNotifications.length === 0 && !loading"
        :icons="['fa-bell-slash', 'fa-bell']"
        title="沒有找到符合條件的通知"
        :compact="true"
      />'''
        }
    ],
}

# Files that need EmptyState import
files_need_import = [
    'admin/EmailLogsManagement.vue',
    'admin/NotificationManagement.vue',
    'admin/ProjectManagement.vue',
    'admin/UserManagement.vue',
    'admin/GroupManagement.vue',
    'admin/TagManagement.vue',
    'admin/SystemSettings.vue',
    'admin/project/ViewerManagementDrawer.vue',
    'admin/user/UserEditorDrawer.vue',
    'StageComments.vue',
    'NotificationCenter.vue',
    'EventLogViewer.vue',
    'shared/UserActivityDetail.vue',
    'shared/AwardPointsDrawer.vue',
    'VotingAnalysisModal.vue',
    'CommentVotingAnalysisModal.vue',
    'TeacherVoteModal.vue',
    'charts/WalletLadder.vue',
    'charts/StageGanttChart.vue',
    'common/CommentRankingTransfer.vue',
    'common/DraggableRankingList.vue',
    'SystemAdmin.vue',
    'admin/SystemLogs.vue',
]

def main():
    base_path = Path('src/components')

    for file_path in files_need_import:
        full_path = base_path / file_path
        if not full_path.exists():
            print(f"⚠️  File not found: {full_path}")
            continue

        print(f"Processing: {file_path}")

        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check if already imported
        if 'EmptyState' in content:
            print(f"  ✓ EmptyState already imported")
        else:
            # Find the last import statement
            import_pattern = r"(import .+ from ['\"].+['\"])"
            imports = list(re.finditer(import_pattern, content))
            if imports:
                last_import = imports[-1]
                insert_pos = last_import.end()
                content = content[:insert_pos] + "\nimport EmptyState from '@/components/shared/EmptyState.vue'" + content[insert_pos:]
                print(f"  ✓ Added EmptyState import")

        # Apply specific replacements if defined
        if file_path in replacements:
            for repl in replacements[file_path]:
                if repl['old'] in content:
                    content = content.replace(repl['old'], repl['new'])
                    print(f"  ✓ Replaced empty state")

        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)

    print("\n✓ Processing complete!")

if __name__ == '__main__':
    main()
