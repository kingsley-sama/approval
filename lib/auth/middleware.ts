import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import { User } from '@/lib/db/schema';

export type ActionState = {
  error?: string;
  success?: string;
  email?: string;
  password?: string;
  [key: string]: any;
};

type ValidatedActionFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData
) => Promise<T>;

export function validatedAction<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionFunction<S, T>
) {
  return async (prevState: ActionState, formData: FormData) => {
    try {
      const result = schema.safeParse(Object.fromEntries(formData));
      if (!result.success) {
        return { error: result.error.errors[0].message };
      }
      return action(result.data, formData);
    } catch (error) {
      if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
        throw error;
      }
      return { error: 'Something went wrong. Please try again.' };
    }
  };
}

type ValidatedActionWithUserFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData,
  user: User
) => Promise<T>;

export function validatedActionWithUser<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionWithUserFunction<S, T>
) {
  return async (prevState: ActionState, formData: FormData) => {
    try {
      const user = await getUser();
      if (!user) {
        throw new Error('User is not authenticated');
      }
      const result = schema.safeParse(Object.fromEntries(formData));
      if (!result.success) {
        return { error: result.error.errors[0].message };
      }
      return action(result.data, formData, user);
    } catch (error) {
      if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
        throw error;
      }
      return { error: 'Something went wrong. Please try again.' };
    }
  };
}
