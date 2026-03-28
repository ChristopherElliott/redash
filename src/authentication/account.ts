import jwt from "jsonwebtoken";
import { settings } from "../settings";
import { sendMail } from "../tasks/general";
import { User } from "../models/user";
import { Organization } from "../models/organization";
import { baseUrl } from "../utils";
import logger from "../logger";

const TOKEN_EXPIRY = settings.INVITATION_TOKEN_MAX_AGE; // seconds

export function createInviteToken(user: User): string {
  return jwt.sign({ userId: String(user.id) }, settings.SECRET_KEY, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function validateToken(token: string): string {
  const payload = jwt.verify(token, settings.SECRET_KEY) as { userId: string };
  return payload.userId;
}

export function verifyLinkForUser(user: User, org: Organization): string {
  const token = createInviteToken(user);
  return `${baseUrl(org)}/verify/${token}`;
}

export function inviteLinkForUser(user: User, org: Organization): string {
  const token = createInviteToken(user);
  return `${baseUrl(org)}/invite/${token}`;
}

export function resetLinkForUser(user: User, org: Organization): string {
  const token = createInviteToken(user);
  return `${baseUrl(org)}/reset/${token}`;
}

export async function sendVerifyEmail(user: User, org: Organization): Promise<void> {
  const verifyUrl = verifyLinkForUser(user, org);
  const subject = `${user.name}, please verify your email address`;
  const html = `<p>Please verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p>`;
  const text = `Please verify your email: ${verifyUrl}`;
  await sendMail([user.email], subject, html, text);
}

export async function sendInviteEmail(
  inviter: User,
  invited: User,
  inviteUrl: string,
  org: Organization
): Promise<void> {
  const subject = `${inviter.name} invited you to join Redash`;
  const html = `<p>${inviter.name} has invited you to join ${org.name}. <a href="${inviteUrl}">Accept invite</a></p>`;
  const text = `${inviter.name} has invited you to join ${org.name}. Accept: ${inviteUrl}`;
  await sendMail([invited.email], subject, html, text);
}

export async function sendPasswordResetEmail(user: User, org: Organization): Promise<string> {
  const resetLink = resetLinkForUser(user, org);
  const subject = "Reset your password";
  const html = `<p>Reset your Redash password: <a href="${resetLink}">${resetLink}</a></p>`;
  const text = `Reset your Redash password: ${resetLink}`;
  await sendMail([user.email], subject, html, text);
  return resetLink;
}

export async function sendUserDisabledEmail(user: User): Promise<void> {
  const subject = "Your Redash account is disabled";
  const html = `<p>Your Redash account has been disabled. Please contact your administrator.</p>`;
  const text = `Your Redash account has been disabled. Please contact your administrator.`;
  await sendMail([user.email], subject, html, text);
}
