#!/usr/bin/env python3
"""
Settlement Implementation Test Script
======================================
This script analyzes the Cloudflare Workers D1 database to:
1. Verify database schema matches expectations
2. Query test data for settlement simulation
3. Simulate settlement calculations
4. Test SQL queries for correctness
5. Generate detailed report

Usage:
    python test_settlement.py
"""

import sqlite3
import json
import sys
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# Database path (wrangler D1 miniflare database)
DB_PATH = Path(__file__).parent / "Cloudflare-Workers/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9df28f04f05382502329e45f8b5feac5bbb6f3790e2007def3f0e4e7a73a6de9.sqlite"

class SettlementTester:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = None
        self.issues = []
        self.warnings = []

    def connect(self):
        """Connect to SQLite database"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            self.conn.row_factory = sqlite3.Row
            print(f"✅ Connected to database: {self.db_path}")
            return True
        except Exception as e:
            print(f"❌ Failed to connect to database: {e}")
            return False

    def check_schema(self):
        """Verify database schema has all required tables and columns"""
        print("\n" + "="*80)
        print("📋 SCHEMA VERIFICATION")
        print("="*80)

        cursor = self.conn.cursor()

        # Check required tables
        required_tables = [
            'stages', 'rankings', 'users', 'groups', 'usergroups',
            'settlementhistory', 'stagesettlements', 'commentsettlements',
            'transactions', 'projects'
        ]

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        existing_tables = [row[0] for row in cursor.fetchall()]

        print("\n📊 Table Status:")
        for table in required_tables:
            status = "✅" if table in existing_tables else "❌"
            print(f"  {status} {table}")
            if table not in existing_tables:
                self.issues.append(f"Missing table: {table}")

        # Check stages table columns
        print("\n📋 Stages Table Columns:")
        cursor.execute("PRAGMA table_info(stages)")
        stage_columns = {row[1]: row[2] for row in cursor.fetchall()}

        required_stage_cols = {
            'stageId': 'TEXT',
            'projectId': 'TEXT',
            'stageName': 'TEXT',
            'stageOrder': 'INTEGER',
            'startTime': 'INTEGER',
            'endTime': 'INTEGER',
            'status': 'TEXT',
            'reportRewardPool': 'REAL',
            'commentRewardPool': 'REAL',
            # Missing columns that CF Workers code expects:
            'finalRankings': 'TEXT',
            'scoringResults': 'TEXT',
            'settledTime': 'INTEGER'
        }

        for col, col_type in required_stage_cols.items():
            if col in stage_columns:
                print(f"  ✅ {col} ({stage_columns[col]})")
            else:
                print(f"  ❌ {col} ({col_type}) - MISSING!")
                self.issues.append(f"Missing column in stages table: {col}")

        # Check transactions table structure
        print("\n💰 Transactions Table Columns:")
        cursor.execute("PRAGMA table_info(transactions)")
        txn_columns = {row[1]: row[2] for row in cursor.fetchall()}

        required_txn_cols = ['transactionId', 'projectId', 'userEmail', 'stageId',
                            'settlementId', 'transactionType', 'amount', 'timestamp']

        for col in required_txn_cols:
            status = "✅" if col in txn_columns else "❌"
            print(f"  {status} {col}")
            if col not in txn_columns:
                self.issues.append(f"Missing column in transactions table: {col}")

    def query_test_data(self):
        """Query test data from database"""
        print("\n" + "="*80)
        print("📊 TEST DATA QUERY")
        print("="*80)

        cursor = self.conn.cursor()

        # Get projects
        cursor.execute("SELECT * FROM projects LIMIT 5")
        projects = cursor.fetchall()
        print(f"\n✅ Found {len(projects)} projects")
        for proj in projects:
            print(f"  - {proj['projectName']} (ID: {proj['projectId']})")

        if not projects:
            print("  ⚠️  No test projects found!")
            self.warnings.append("No test projects in database")
            return None

        # Use first project for testing
        test_project_id = projects[0]['projectId']
        test_project_name = projects[0]['projectName']

        # Get stages for this project
        cursor.execute("""
            SELECT * FROM stages
            WHERE projectId = ?
            ORDER BY stageOrder
        """, (test_project_id,))
        stages = cursor.fetchall()

        print(f"\n✅ Found {len(stages)} stages in project '{test_project_name}':")
        for stage in stages:
            reward_pool = stage['reportRewardPool'] if stage['reportRewardPool'] is not None else 0
            print(f"  - {stage['stageName']} (Status: {stage['status']}, "
                  f"Reward Pool: {reward_pool})")

        if not stages:
            print("  ⚠️  No stages found!")
            self.warnings.append(f"No stages in project {test_project_id}")
            return None

        # Find a voting stage
        voting_stage = None
        for stage in stages:
            if stage['status'] == 'voting':
                voting_stage = stage
                break

        if not voting_stage:
            print("\n  ⚠️  No voting stage found. Looking for any active stage...")
            for stage in stages:
                if stage['status'] in ['active', 'pending']:
                    voting_stage = stage
                    print(f"  📍 Using stage '{stage['stageName']}' (status: {stage['status']})")
                    break

        if not voting_stage:
            print("  ⚠️  No suitable stage for testing!")
            self.warnings.append("No voting or active stage found")
            return None

        test_stage_id = voting_stage['stageId']
        test_stage_name = voting_stage['stageName']

        print(f"\n🎯 Using test stage: '{test_stage_name}' (ID: {test_stage_id})")

        # Get groups
        cursor.execute("""
            SELECT * FROM groups
            WHERE projectId = ? AND status = 'active'
        """, (test_project_id,))
        groups = cursor.fetchall()

        print(f"\n✅ Found {len(groups)} active groups:")
        for group in groups:
            print(f"  - {group['groupName']} (ID: {group['groupId']})")

        # Get group members
        group_members = {}
        for group in groups:
            cursor.execute("""
                SELECT ug.*, u.displayName
                FROM usergroups ug
                JOIN users u ON ug.userEmail = u.userEmail
                WHERE ug.groupId = ? AND ug.isActive = 1
            """, (group['groupId'],))
            members = cursor.fetchall()
            group_members[group['groupId']] = members
            print(f"  - {group['groupName']}: {len(members)} members")
            for member in members:
                print(f"    • {member['displayName']} ({member['userEmail']})")

        # Get rankings/votes
        cursor.execute("""
            SELECT r.*, u.userEmail as proposerEmail, u.displayName
            FROM rankings r
            JOIN users u ON r.proposerUserId = u.userId
            WHERE r.stageId = ?
        """, (test_stage_id,))
        rankings = cursor.fetchall()

        print(f"\n✅ Found {len(rankings)} rankings/votes for stage '{test_stage_name}':")
        for rank in rankings:
            ranking_data = json.loads(rank['rankingData']) if rank['rankingData'] else {}
            print(f"  - {rank['displayName']} ({rank['proposerEmail']})")
            print(f"    Rankings: {ranking_data}")

        return {
            'project': projects[0],
            'stage': voting_stage,
            'groups': groups,
            'group_members': group_members,
            'rankings': rankings
        }

    def simulate_settlement(self, test_data):
        """Simulate settlement calculation based on test data"""
        print("\n" + "="*80)
        print("🧮 SETTLEMENT SIMULATION")
        print("="*80)

        if not test_data:
            print("⚠️  No test data available for simulation")
            return

        stage = test_data['stage']
        groups = test_data['groups']
        rankings = test_data['rankings']
        group_members = test_data['group_members']

        reward_pool = stage['reportRewardPool'] if stage['reportRewardPool'] is not None else 0
        print(f"\n📊 Simulating settlement for: {stage['stageName']}")
        print(f"Reward Pool: {reward_pool} points")
        print(f"Groups: {len(groups)}")
        print(f"Votes: {len(rankings)}")

        if len(rankings) == 0:
            print("\n⚠️  No votes to calculate! Cannot simulate settlement.")
            self.warnings.append("No rankings found for test stage")
            return

        # Calculate Borda count scores
        print("\n🔢 Calculating Borda Count Scores:")
        group_scores = defaultdict(lambda: {'total': 0, 'votes': 0})

        for rank in rankings:
            try:
                ranking_data = json.loads(rank['rankingData']) if rank['rankingData'] else {}
                voter = rank['proposerEmail']

                print(f"\n  Voter: {voter}")
                for group_id, position in ranking_data.items():
                    # Borda count: higher position = more points
                    # If 5 groups: 1st=5pts, 2nd=4pts, 3rd=3pts, 4th=2pts, 5th=1pt
                    borda_points = len(groups) - position + 1
                    group_scores[group_id]['total'] += borda_points
                    group_scores[group_id]['votes'] += 1

                    # Find group name
                    group_name = next((g['groupName'] for g in groups if g['groupId'] == group_id), group_id)
                    print(f"    - {group_name}: Position {position} → {borda_points} points")

            except Exception as e:
                print(f"    ⚠️  Error processing ranking: {e}")
                self.warnings.append(f"Error parsing ranking data: {e}")

        # Calculate final rankings
        print("\n🏆 Final Rankings (by Borda Count):")
        sorted_groups = sorted(group_scores.items(), key=lambda x: x[1]['total'], reverse=True)

        final_rankings = {}
        total_reward = stage['reportRewardPool'] if stage['reportRewardPool'] is not None else 0

        for rank, (group_id, scores) in enumerate(sorted_groups, 1):
            group_name = next((g['groupName'] for g in groups if g['groupId'] == group_id), group_id)
            avg_score = scores['total'] / scores['votes'] if scores['votes'] > 0 else 0
            final_rankings[group_id] = {
                'rank': rank,
                'score': scores['total'],
                'avg_score': avg_score,
                'votes_received': scores['votes']
            }
            print(f"  {rank}. {group_name}: {scores['total']} points ({avg_score:.2f} avg)")

        # Calculate point distribution (example: simple percentage)
        print("\n💰 Point Distribution:")
        if total_reward > 0:
            # Simple distribution: divide by rank weights
            # Example: 1st gets 40%, 2nd gets 30%, 3rd gets 20%, 4th gets 10%
            rank_weights = {1: 0.4, 2: 0.3, 3: 0.2, 4: 0.1}

            for group_id, ranking in final_rankings.items():
                rank = ranking['rank']
                weight = rank_weights.get(rank, 0.05)  # 5% for others
                allocated_points = total_reward * weight
                ranking['allocated_points'] = allocated_points

                group_name = next((g['groupName'] for g in groups if g['groupId'] == group_id), group_id)
                members = group_members.get(group_id, [])
                points_per_member = allocated_points / len(members) if len(members) > 0 else 0

                print(f"\n  {group_name} (Rank {rank}):")
                print(f"    Total: {allocated_points:.2f} points ({weight*100:.0f}%)")
                print(f"    Per member ({len(members)}): {points_per_member:.2f} points")

                for member in members:
                    print(f"      • {member['displayName']}: +{points_per_member:.2f}")
        else:
            print("  ⚠️  No reward pool set for this stage")

        return final_rankings

    def test_sql_queries(self, test_data):
        """Test the actual SQL queries that will be used"""
        print("\n" + "="*80)
        print("🧪 SQL QUERY TESTING")
        print("="*80)

        if not test_data:
            print("⚠️  No test data available for SQL testing")
            return

        cursor = self.conn.cursor()
        stage_id = test_data['stage']['stageId']

        # Test 1: Query votes (as in CF Workers code)
        print("\n1️⃣  Testing vote query (from settlement.ts line 112):")
        query1 = """
            SELECT u.userEmail as proposerEmail, rp.rankingData
            FROM rankings rp
            JOIN users u ON rp.proposerUserId = u.userId
            WHERE rp.stageId = ? AND rp.status = 'submitted'
        """
        print(f"   Query: {query1}")

        try:
            cursor.execute(query1, (stage_id,))
            results = cursor.fetchall()
            print(f"   ✅ Success! Found {len(results)} votes")
            for row in results:
                print(f"      - {row['proposerEmail']}: {row['rankingData'][:50]}...")
        except Exception as e:
            print(f"   ❌ Error: {e}")
            self.issues.append(f"Vote query failed: {e}")

        # Test 2: Update stage status (THIS WILL FAIL due to missing columns)
        print("\n2️⃣  Testing stage update query (from settlement.ts line 149):")
        query2 = """
            UPDATE stages
            SET status = 'completed',
                finalRankings = ?,
                scoringResults = ?,
                settledTime = ?
            WHERE stageId = ?
        """
        print(f"   Query: {query2}")

        try:
            # Don't actually execute, just prepare
            cursor.execute("PRAGMA table_info(stages)")
            columns = [row[1] for row in cursor.fetchall()]

            missing_cols = []
            for col in ['finalRankings', 'scoringResults', 'settledTime']:
                if col not in columns:
                    missing_cols.append(col)

            if missing_cols:
                print(f"   ❌ WILL FAIL! Missing columns: {', '.join(missing_cols)}")
                self.issues.append(f"Stage update will fail due to missing columns: {missing_cols}")
            else:
                print(f"   ✅ All columns exist")
        except Exception as e:
            print(f"   ❌ Error: {e}")
            self.issues.append(f"Stage update check failed: {e}")

        # Test 3: Check if settlementhistory table exists
        print("\n3️⃣  Testing settlement history table:")
        try:
            cursor.execute("SELECT * FROM settlementhistory LIMIT 1")
            print(f"   ✅ settlementhistory table exists")
        except Exception as e:
            print(f"   ❌ settlementhistory table missing or error: {e}")
            self.issues.append("settlementhistory table not accessible")

        # Test 4: Check if stagesettlements table exists
        print("\n4️⃣  Testing stage settlements table:")
        try:
            cursor.execute("SELECT * FROM stagesettlements LIMIT 1")
            print(f"   ✅ stagesettlements table exists")
        except Exception as e:
            print(f"   ❌ stagesettlements table missing or error: {e}")
            self.issues.append("stagesettlements table not accessible")

    def generate_report(self):
        """Generate final report"""
        print("\n" + "="*80)
        print("📋 FINAL REPORT")
        print("="*80)

        if len(self.issues) == 0 and len(self.warnings) == 0:
            print("\n🎉 All tests passed! No issues found.")
        else:
            if len(self.issues) > 0:
                print(f"\n❌ Found {len(self.issues)} CRITICAL ISSUES:")
                for i, issue in enumerate(self.issues, 1):
                    print(f"   {i}. {issue}")

            if len(self.warnings) > 0:
                print(f"\n⚠️  Found {len(self.warnings)} warnings:")
                for i, warning in enumerate(self.warnings, 1):
                    print(f"   {i}. {warning}")

        print("\n" + "="*80)
        print("✅ Test complete!")
        print("="*80)

    def run_all_tests(self):
        """Run all tests"""
        if not self.connect():
            return False

        try:
            self.check_schema()
            test_data = self.query_test_data()
            self.simulate_settlement(test_data)
            self.test_sql_queries(test_data)
            self.generate_report()
            return True
        except Exception as e:
            print(f"\n❌ Test execution error: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            if self.conn:
                self.conn.close()
                print("\n📌 Database connection closed")

def main():
    """Main entry point"""
    print("="*80)
    print("🔍 CLOUDFLARE WORKERS SETTLEMENT IMPLEMENTATION TEST")
    print("="*80)
    print(f"Database: {DB_PATH}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if not DB_PATH.exists():
        print(f"\n❌ Database file not found: {DB_PATH}")
        print("   Please ensure wrangler dev has been run at least once.")
        sys.exit(1)

    tester = SettlementTester(DB_PATH)
    success = tester.run_all_tests()

    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
