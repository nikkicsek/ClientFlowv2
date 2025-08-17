// Simple test script to debug My Tasks without authentication
import { storage } from './storage.js';

async function testMyTasks() {
  console.log('Testing My Tasks system...\n');

  try {
    // Test 1: Get all users
    console.log('=== TEST 1: ALL USERS ===');
    const users = await storage.getAllUsers();
    console.log(`Found ${users.length} users:`);
    users.forEach((user, i) => {
      console.log(`  ${i+1}. ID: ${user.id.substring(0, 8)}... Email: ${user.email}`);
    });

    if (users.length === 0) {
      console.log('No users found - authentication required first');
      return;
    }

    const testUser = users[0]; // Use first user for testing
    console.log(`\nUsing test user: ${testUser.email}`);

    // Test 2: Get all team members
    console.log('\n=== TEST 2: ALL TEAM MEMBERS ===');
    const teamMembers = await storage.getAllTeamMembers();
    console.log(`Found ${teamMembers.length} team members:`);
    teamMembers.forEach((member, i) => {
      console.log(`  ${i+1}. ID: ${member.id} Email: ${member.email} Name: ${member.name || 'N/A'}`);
    });

    // Test 3: Find team member for test user
    console.log('\n=== TEST 3: USER-TO-TEAM-MEMBER MAPPING ===');
    const userTeamMember = teamMembers.find(member => member.email === testUser.email);
    if (userTeamMember) {
      console.log(`✓ Found team member record for ${testUser.email}:`);
      console.log(`  Team Member ID: ${userTeamMember.id}`);
      console.log(`  Name: ${userTeamMember.name || 'N/A'}`);
    } else {
      console.log(`✗ No team member record found for ${testUser.email}`);
      console.log('This explains why My Tasks is empty!');
    }

    // Test 4: Get task assignments
    if (userTeamMember) {
      console.log('\n=== TEST 4: TASK ASSIGNMENTS ===');
      const assignments = await storage.getTaskAssignmentsByTeamMember(userTeamMember.id);
      console.log(`Found ${assignments.length} task assignments for team member ${userTeamMember.id}`);
      
      assignments.slice(0, 3).forEach((assignment, i) => {
        console.log(`  ${i+1}. Task: "${assignment.task.title}" (${assignment.task.status})`);
        console.log(`     Due: ${assignment.task.dueDate || 'No date'} ${assignment.task.dueTime || ''}`);
      });
    }

    // Test 5: Get all task assignments (to see if there are any)
    console.log('\n=== TEST 5: ALL TASK ASSIGNMENTS ===');
    const allAssignments = await storage.getAllTaskAssignments();
    console.log(`Total assignments in system: ${allAssignments.length}`);
    
    if (allAssignments.length > 0) {
      console.log('Recent assignments:');
      allAssignments.slice(0, 3).forEach((assignment, i) => {
        console.log(`  ${i+1}. Task: "${assignment.task.title}"`);
        console.log(`     Team Member ID: ${assignment.teamMemberId}`);
        console.log(`     Assigned By: ${assignment.assignedBy}`);
      });
    }

  } catch (error) {
    console.error('Error testing My Tasks:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testMyTasks();