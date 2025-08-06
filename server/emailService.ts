import sgMail from '@sendgrid/mail';

interface EmailNotificationData {
  to: string;
  subject: string;
  template: 'task_assignment' | 'task_update' | 'task_completion';
  data: {
    teamMemberName: string;
    taskTitle: string;
    projectName: string;
    priority?: string;
    assignedBy?: string;
    dueDate?: string;
    notes?: string;
  };
}

class EmailService {
  private initialized = false;

  constructor() {
    this.initializeSendGrid();
  }

  private initializeSendGrid() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.initialized = true;
      console.log('SendGrid email service initialized');
    } else {
      console.warn('SENDGRID_API_KEY not found - email notifications disabled');
    }
  }

  private getEmailTemplate(template: string, data: any): { subject: string; html: string; text: string } {
    switch (template) {
      case 'task_assignment':
        return {
          subject: `New Task Assigned: ${data.taskTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">New Task Assignment</h2>
              <p>Hi ${data.teamMemberName},</p>
              <p>You have been assigned a new task:</p>
              
              <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${data.taskTitle}</h3>
                <p><strong>Project:</strong> ${data.projectName}</p>
                <p><strong>Priority:</strong> ${data.priority || 'Medium'}</p>
                ${data.dueDate ? `<p><strong>Due Date:</strong> ${data.dueDate}</p>` : ''}
                ${data.assignedBy ? `<p><strong>Assigned by:</strong> ${data.assignedBy}</p>` : ''}
                ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
              </div>
              
              <p>Please log into the project management dashboard to view more details.</p>
              <p>Best regards,<br>Your Project Management Team</p>
            </div>
          `,
          text: `
            Hi ${data.teamMemberName},
            
            You have been assigned a new task: ${data.taskTitle}
            Project: ${data.projectName}
            Priority: ${data.priority || 'Medium'}
            ${data.dueDate ? `Due Date: ${data.dueDate}` : ''}
            ${data.assignedBy ? `Assigned by: ${data.assignedBy}` : ''}
            ${data.notes ? `Notes: ${data.notes}` : ''}
            
            Please log into the project management dashboard to view more details.
            
            Best regards,
            Your Project Management Team
          `
        };

      case 'task_update':
        return {
          subject: `Task Updated: ${data.taskTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">Task Update</h2>
              <p>Hi ${data.teamMemberName},</p>
              <p>One of your assigned tasks has been updated:</p>
              
              <div style="background: #fefbf3; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${data.taskTitle}</h3>
                <p><strong>Project:</strong> ${data.projectName}</p>
                <p><strong>Priority:</strong> ${data.priority || 'Medium'}</p>
                ${data.notes ? `<p><strong>Update Notes:</strong> ${data.notes}</p>` : ''}
              </div>
              
              <p>Please check the project dashboard for full details.</p>
              <p>Best regards,<br>Your Project Management Team</p>
            </div>
          `,
          text: `
            Hi ${data.teamMemberName},
            
            One of your assigned tasks has been updated: ${data.taskTitle}
            Project: ${data.projectName}
            Priority: ${data.priority || 'Medium'}
            ${data.notes ? `Update Notes: ${data.notes}` : ''}
            
            Please check the project dashboard for full details.
            
            Best regards,
            Your Project Management Team
          `
        };

      case 'task_completion':
        return {
          subject: `Task Completed: ${data.taskTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #10b981;">Task Completed</h2>
              <p>Hi ${data.teamMemberName},</p>
              <p>Great news! A task assigned to you has been marked as completed:</p>
              
              <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">${data.taskTitle}</h3>
                <p><strong>Project:</strong> ${data.projectName}</p>
              </div>
              
              <p>Thank you for your excellent work!</p>
              <p>Best regards,<br>Your Project Management Team</p>
            </div>
          `,
          text: `
            Hi ${data.teamMemberName},
            
            Great news! A task assigned to you has been marked as completed: ${data.taskTitle}
            Project: ${data.projectName}
            
            Thank you for your excellent work!
            
            Best regards,
            Your Project Management Team
          `
        };

      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }

  async sendNotification(notificationData: EmailNotificationData): Promise<boolean> {
    if (!this.initialized) {
      console.warn('Email service not initialized - skipping email notification');
      return false;
    }

    try {
      const { subject, html, text } = this.getEmailTemplate(notificationData.template, notificationData.data);
      
      const msg = {
        to: notificationData.to,
        from: 'noreply@agencypro.app', // This should be a verified sender in SendGrid
        subject,
        text,
        html,
      };

      await sgMail.send(msg);
      console.log(`Email notification sent to ${notificationData.to}: ${subject}`);
      return true;
    } catch (error) {
      console.error('Failed to send email notification:', error);
      return false;
    }
  }

  async sendTaskAssignmentNotification(
    teamMemberEmail: string,
    teamMemberName: string,
    taskTitle: string,
    projectName: string,
    options: {
      priority?: string;
      assignedBy?: string;
      dueDate?: string;
      notes?: string;
    } = {}
  ): Promise<boolean> {
    return this.sendNotification({
      to: teamMemberEmail,
      subject: `New Task Assigned: ${taskTitle}`,
      template: 'task_assignment',
      data: {
        teamMemberName,
        taskTitle,
        projectName,
        ...options,
      },
    });
  }

  async sendTaskUpdateNotification(
    teamMemberEmail: string,
    teamMemberName: string,
    taskTitle: string,
    projectName: string,
    options: {
      priority?: string;
      notes?: string;
    } = {}
  ): Promise<boolean> {
    return this.sendNotification({
      to: teamMemberEmail,
      subject: `Task Updated: ${taskTitle}`,
      template: 'task_update',
      data: {
        teamMemberName,
        taskTitle,
        projectName,
        ...options,
      },
    });
  }
}

export const emailService = new EmailService();