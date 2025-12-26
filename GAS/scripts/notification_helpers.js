/**
 * @fileoverview Helper functions for sending notifications in various scenarios
 * @module NotificationHelpers
 */

/**
 * Send notifications when a stage is created
 */
function sendStageCreatedNotifications(projectId, stageId, stageName, creatorEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);

    if (!project) {
      logErr('Project not found for stage notification', { projectId });
      return;
    }

    // Get creator info
    const creator = globalData.users.find(u => u.userEmail === creatorEmail);
    const creatorName = creator ? (creator.displayName || creator.username) : creatorEmail;

    // Get all active project members except the creator
    const recipients = projectData.usergroups
      .filter(ug => ug.isActive && ug.userEmail !== creatorEmail)
      .map(ug => ug.userEmail);

    // Remove duplicates
    const uniqueRecipients = [...new Set(recipients)];

    // Create notification for each recipient
    uniqueRecipients.forEach(recipientEmail => {
      createNotification({
        targetUserEmail: recipientEmail,
        type: 'stage_created',
        title: `新階段：${stageName}`,
        content: `${creatorName} 在專案「${project.projectName}」中創建了新階段「${stageName}」`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: stageId,
        metadata: {
          creatorEmail: creatorEmail,
          creatorName: creatorName,
          projectName: project.projectName,
          stageName: stageName
        }
      });
    });

    log('Stage created notifications sent', { stageId, recipientCount: uniqueRecipients.length });

  } catch (error) {
    logErr('Send stage created notifications error', error);
  }
}

/**
 * Send notifications when stage status changes
 */
function sendStageStatusChangeNotifications(projectId, stageId, oldStatus, newStatus, changerEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);

    if (!project || !stage) {
      logErr('Project or stage not found for status change notification', { projectId, stageId });
      return;
    }

    // Get changer info
    const changer = globalData.users.find(u => u.userEmail === changerEmail);
    const changerName = changer ? (changer.displayName || changer.username) : changerEmail;

    // Status display names
    const statusNames = {
      'pending': '準備中',
      'active': '進行中',
      'voting': '投票中',
      'settled': '已結算',
      'paused': '已暫停',
      'closed': '已關閉'
    };

    const oldStatusName = statusNames[oldStatus] || oldStatus;
    const newStatusName = statusNames[newStatus] || newStatus;

    // Get all active project members except the changer
    const recipients = projectData.usergroups
      .filter(ug => ug.isActive && ug.userEmail !== changerEmail)
      .map(ug => ug.userEmail);

    const uniqueRecipients = [...new Set(recipients)];

    // Create notification for each recipient
    uniqueRecipients.forEach(recipientEmail => {
      createNotification({
        targetUserEmail: recipientEmail,
        type: 'stage_status_changed',
        title: `階段狀態變更：${stage.stageName}`,
        content: `${changerName} 將階段「${stage.stageName}」的狀態從「${oldStatusName}」變更為「${newStatusName}」`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: stageId,
        metadata: {
          changerEmail: changerEmail,
          changerName: changerName,
          projectName: project.projectName,
          stageName: stage.stageName,
          oldStatus: oldStatus,
          newStatus: newStatus
        }
      });
    });

    log('Stage status change notifications sent', { stageId, recipientCount: uniqueRecipients.length });

  } catch (error) {
    logErr('Send stage status change notifications error', error);
  }
}

/**
 * Send notifications when a submission is created
 */
function sendSubmissionCreatedNotifications(projectId, stageId, groupId, submissionId, submitterEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const group = projectData.groups.find(g => g.groupId === groupId);

    if (!project || !stage || !group) {
      logErr('Project, stage or group not found for submission notification', { projectId, stageId, groupId });
      return;
    }

    // Get submitter info
    const submitter = globalData.users.find(u => u.userEmail === submitterEmail);
    const submitterName = submitter ? (submitter.displayName || submitter.username) : submitterEmail;

    // Only send to group members (not other project members)
    const groupMembers = projectData.usergroups
      .filter(ug => ug.groupId === groupId && ug.isActive && ug.userEmail !== submitterEmail)
      .map(ug => ug.userEmail);

    // Send to group members only
    groupMembers.forEach(recipientEmail => {
      createNotification({
        targetUserEmail: recipientEmail,
        type: 'submission_created_group',
        title: `組別提交了新作品`,
        content: `${submitterName} 在階段「${stage.stageName}」為您的組別「${group.groupName}」提交了新作品`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: submissionId,
        metadata: {
          submitterEmail: submitterEmail,
          submitterName: submitterName,
          projectName: project.projectName,
          stageName: stage.stageName,
          groupName: group.groupName,
          submissionId: submissionId
        }
      });
    });

    log('Submission created notifications sent to group members', {
      submissionId,
      groupMemberCount: groupMembers.length
    });

  } catch (error) {
    logErr('Send submission created notifications error', error);
  }
}

/**
 * Send notifications when a comment is created
 */
function sendCommentCreatedNotifications(projectId, stageId, commentId, commentContent, authorEmail, mentionedUsers, mentionedGroups, parentCommentId) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);

    if (!project || !stage) {
      logErr('Project or stage not found for comment notification', { projectId, stageId });
      return;
    }

    // Get author info
    const author = globalData.users.find(u => u.userEmail === authorEmail);
    const authorName = author ? (author.displayName || author.username) : authorEmail;

    // Truncate comment content for notification
    const contentPreview = commentContent.length > 100
      ? commentContent.substring(0, 100) + '...'
      : commentContent;

    const recipients = new Set();

    // If it's a reply, notify the parent comment author
    if (parentCommentId) {
      const parentComment = projectData.comments.find(c => c.commentId === parentCommentId);
      if (parentComment && parentComment.authorEmail !== authorEmail) {
        recipients.add(parentComment.authorEmail);

        createNotification({
          targetUserEmail: parentComment.authorEmail,
          type: 'comment_reply',
          title: `有人回覆了您的評論`,
          content: `${authorName} 回覆了您在階段「${stage.stageName}」的評論：${contentPreview}`,
          projectId: projectId,
          stageId: stageId,
          commentId: commentId,
          relatedEntityId: commentId,
          metadata: {
            authorEmail: authorEmail,
            authorName: authorName,
            projectName: project.projectName,
            stageName: stage.stageName,
            commentId: commentId,
            parentCommentId: parentCommentId
          }
        });
      }
    }

    // Notify mentioned users
    if (mentionedUsers && Array.isArray(mentionedUsers)) {
      mentionedUsers.forEach(userEmail => {
        if (userEmail !== authorEmail && !recipients.has(userEmail)) {
          recipients.add(userEmail);

          createNotification({
            targetUserEmail: userEmail,
            type: 'comment_mention',
            title: `有人在評論中提及您`,
            content: `${authorName} 在階段「${stage.stageName}」的評論中提及了您：${contentPreview}`,
            projectId: projectId,
            stageId: stageId,
            commentId: commentId,
            relatedEntityId: commentId,
            metadata: {
              authorEmail: authorEmail,
              authorName: authorName,
              projectName: project.projectName,
              stageName: stage.stageName,
              commentId: commentId
            }
          });
        }
      });
    }

    // Notify mentioned groups
    if (mentionedGroups && Array.isArray(mentionedGroups)) {
      mentionedGroups.forEach(groupId => {
        const groupMembers = projectData.usergroups
          .filter(ug => ug.groupId === groupId && ug.isActive && ug.userEmail !== authorEmail && !recipients.has(ug.userEmail))
          .map(ug => ug.userEmail);

        const group = projectData.groups.find(g => g.groupId === groupId);
        const groupName = group ? group.groupName : groupId;

        groupMembers.forEach(memberEmail => {
          recipients.add(memberEmail);

          createNotification({
            targetUserEmail: memberEmail,
            type: 'comment_group_mention',
            title: `有人在評論中提及您的組別`,
            content: `${authorName} 在階段「${stage.stageName}」的評論中提及了您的組別「${groupName}」：${contentPreview}`,
            projectId: projectId,
            stageId: stageId,
            commentId: commentId,
            relatedEntityId: commentId,
            metadata: {
              authorEmail: authorEmail,
              authorName: authorName,
              projectName: project.projectName,
              stageName: stage.stageName,
              commentId: commentId,
              groupId: groupId,
              groupName: groupName
            }
          });
        });
      });
    }

    log('Comment created notifications sent', { commentId, recipientCount: recipients.size });

  } catch (error) {
    logErr('Send comment created notifications error', error);
  }
}

/**
 * Send notifications when a voting proposal is created
 */
function sendVotingProposalNotifications(projectId, stageId, proposalId, groupId, proposerEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const group = projectData.groups.find(g => g.groupId === groupId);

    if (!project || !stage || !group) {
      logErr('Project, stage or group not found for voting proposal notification', { projectId, stageId, groupId });
      return;
    }

    // Get proposer info
    const proposer = globalData.users.find(u => u.userEmail === proposerEmail);
    const proposerName = proposer ? (proposer.displayName || proposer.username) : proposerEmail;

    // Get all group members except the proposer
    const groupMembers = projectData.usergroups
      .filter(ug => ug.groupId === groupId && ug.isActive && ug.userEmail !== proposerEmail)
      .map(ug => ug.userEmail);

    // Send to group members
    groupMembers.forEach(recipientEmail => {
      createNotification({
        targetUserEmail: recipientEmail,
        type: 'voting_proposal_created',
        title: `新的投票提案`,
        content: `${proposerName} 在階段「${stage.stageName}」為組別「${group.groupName}」創建了新的排名提案，請前往查看並投票`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: proposalId,
        metadata: {
          proposerEmail: proposerEmail,
          proposerName: proposerName,
          projectName: project.projectName,
          stageName: stage.stageName,
          groupName: group.groupName,
          proposalId: proposalId
        }
      });
    });

    log('Voting proposal notifications sent', { proposalId, recipientCount: groupMembers.length });

  } catch (error) {
    logErr('Send voting proposal notifications error', error);
  }
}

/**
 * Send notifications when someone votes on a proposal
 */
function sendProposalVoteNotifications(projectId, stageId, proposalId, groupId, voterEmail, proposerEmail) {
  try {
    // Don't notify if voter is the proposer
    if (voterEmail === proposerEmail) {
      return;
    }

    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const group = projectData.groups.find(g => g.groupId === groupId);

    if (!project || !stage || !group) {
      return;
    }

    // Get voter info
    const voter = globalData.users.find(u => u.userEmail === voterEmail);
    const voterName = voter ? (voter.displayName || voter.username) : voterEmail;

    // Notify the proposer
    createNotification({
      targetUserEmail: proposerEmail,
      type: 'proposal_vote',
      title: `有人投票支持您的提案`,
      content: `${voterName} 在階段「${stage.stageName}」投票支持了您的排名提案`,
      projectId: projectId,
      stageId: stageId,
      relatedEntityId: proposalId,
      metadata: {
        voterEmail: voterEmail,
        voterName: voterName,
        projectName: project.projectName,
        stageName: stage.stageName,
        groupName: group.groupName,
        proposalId: proposalId
      }
    });

    log('Proposal vote notification sent', { proposalId, voterEmail, proposerEmail });

  } catch (error) {
    logErr('Send proposal vote notifications error', error);
  }
}

/**
 * Send notifications when consensus is reached
 */
function sendConsensusReachedNotifications(projectId, stageId, groupId, selectedProposalId) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const group = projectData.groups.find(g => g.groupId === groupId);

    if (!project || !stage || !group) {
      return;
    }

    // Get all group members
    const groupMembers = projectData.usergroups
      .filter(ug => ug.groupId === groupId && ug.isActive)
      .map(ug => ug.userEmail);

    // Send to all group members
    groupMembers.forEach(recipientEmail => {
      createNotification({
        targetUserEmail: recipientEmail,
        type: 'consensus_reached',
        title: `組別達成共識`,
        content: `您的組別「${group.groupName}」在階段「${stage.stageName}」已達成排名共識`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: selectedProposalId,
        metadata: {
          projectName: project.projectName,
          stageName: stage.stageName,
          groupName: group.groupName,
          selectedProposalId: selectedProposalId
        }
      });
    });

    log('Consensus reached notifications sent', { groupId, recipientCount: groupMembers.length });

  } catch (error) {
    logErr('Send consensus reached notifications error', error);
  }
}

/**
 * Send notifications when points are awarded
 */
function sendPointsAwardedNotifications(projectId, stageId, recipientEmail, amount, source, awardedBy) {
  try {
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);

    if (!project) {
      return;
    }

    // Get awarder info
    const awarder = globalData.users.find(u => u.userEmail === awardedBy);
    const awarderName = awarder ? (awarder.displayName || awarder.username) : awardedBy;

    const projectData = readProjectData(projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);
    const stageName = stage ? stage.stageName : '未知階段';

    // Create notification
    createNotification({
      targetUserEmail: recipientEmail,
      type: 'points_awarded',
      title: amount >= 0 ? `獲得點數` : `點數扣除`,
      content: amount >= 0
        ? `${awarderName} 在階段「${stageName}」給予您 ${amount} 點數。原因：${source}`
        : `${awarderName} 在階段「${stageName}」扣除您 ${Math.abs(amount)} 點數。原因：${source}`,
      projectId: projectId,
      stageId: stageId,
      relatedEntityId: null,
      metadata: {
        awardedBy: awardedBy,
        awarderName: awarderName,
        projectName: project.projectName,
        stageName: stageName,
        amount: amount,
        source: source
      }
    });

    log('Points awarded notification sent', { recipientEmail, amount, source });

  } catch (error) {
    logErr('Send points awarded notifications error', error);
  }
}

/**
 * Send notifications when stage settlement is completed
 */
function sendStageSettlementNotifications(projectId, stageId, settlerEmail) {
  try {
    const projectData = readProjectData(projectId);
    const globalData = readGlobalData();
    const project = globalData.projects.find(p => p.projectId === projectId);
    const stage = projectData.stages.find(s => s.stageId === stageId);

    if (!project || !stage) {
      return;
    }

    // Get settler info
    const settler = globalData.users.find(u => u.userEmail === settlerEmail);
    const settlerName = settler ? (settler.displayName || settler.username) : settlerEmail;

    // Get all active project members
    const recipients = projectData.usergroups
      .filter(ug => ug.isActive)
      .map(ug => ug.userEmail);

    const uniqueRecipients = [...new Set(recipients)];

    // Create notification for each recipient
    uniqueRecipients.forEach(recipientEmail => {
      createNotification({
        targetUserEmail: recipientEmail,
        type: 'stage_settled',
        title: `階段已結算`,
        content: `${settlerName} 已完成階段「${stage.stageName}」的分數結算，請查看您的點數變化`,
        projectId: projectId,
        stageId: stageId,
        relatedEntityId: stageId,
        metadata: {
          settlerEmail: settlerEmail,
          settlerName: settlerName,
          projectName: project.projectName,
          stageName: stage.stageName
        }
      });
    });

    log('Stage settlement notifications sent', { stageId, recipientCount: uniqueRecipients.length });

  } catch (error) {
    logErr('Send stage settlement notifications error', error);
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sendStageCreatedNotifications,
    sendStageStatusChangeNotifications,
    sendSubmissionCreatedNotifications,
    sendCommentCreatedNotifications,
    sendVotingProposalNotifications,
    sendProposalVoteNotifications,
    sendConsensusReachedNotifications,
    sendPointsAwardedNotifications,
    sendStageSettlementNotifications
  };
}
