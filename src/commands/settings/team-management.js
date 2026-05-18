import { fetchApi } from '../../utils/fetchApi.js';

export async function runTeamSubscriptionsList() {
  return fetchApi('/extension/account/subscriptions/list', 'POST', {});
}

export async function runTeamUsersList({ subscriptionId } = {}) {
  return fetchApi('/extension/account/subscription/users/list', 'POST', { subscription_id: subscriptionId });
}

export async function runTeamUserGet({ userId } = {}) {
  return fetchApi('/extension/account/users/user/get', 'POST', { user_id: userId });
}

export async function runTeamUserCreate({ userId, email, name, role, planIds, subscriptionIds, invited } = {}) {
  return fetchApi('/extension/account/users/user/create', 'POST', {
    users: [{
      user_id: userId,
      email,
      name,
      role,
      plan_ids: planIds ? JSON.parse(planIds) : [],
      subscription_ids: subscriptionIds ? JSON.parse(subscriptionIds) : [],
    }],
    invited: invited ?? false,
  });
}

export async function runTeamUserDelete({ userId } = {}) {
  return fetchApi('/extension/account/users/user/delete', 'POST', { user_id: userId });
}

export async function runTeamUserUpdate({ userId, email, name, role, status, planIds, subscriptionIds } = {}) {
  return fetchApi('/extension/account/users/user/update', 'POST', {
    user_id: userId,
    email,
    name,
    role,
    status,
    plan_ids: planIds ? JSON.parse(planIds) : [],
    subscription_ids: subscriptionIds ? JSON.parse(subscriptionIds) : [],
  });
}

export async function runTeamRbacGet({ repo } = {}) {
  return fetchApi('/extension/account/rbac/settings/get', 'POST', { repo });
}

export async function runTeamRbacSave({ repo, data } = {}) {
  return fetchApi('/extension/account/rbac/settings/save', 'POST', { repo, data: JSON.parse(data) });
}

export async function runTeamPlanEnd({ includeUsers } = {}) {
  return fetchApi('/extension/account/plan/subscriptions/end', 'POST', { include_users: includeUsers ?? false });
}
