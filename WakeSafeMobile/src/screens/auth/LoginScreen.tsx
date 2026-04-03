import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, TextInput } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '../../config';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { InputField } from '../../components/ui/InputField';
import { Button } from '../../components/ui/Button';
import { colors, spacing, typography } from '../../theme/tokens';
import { useToast } from '../../components/feedback/ToastProvider';

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const { login } = useAuth();
  const { showToast } = useToast();

  const isDisabled = useMemo(() => !email.trim() || !password.trim() || loading, [email, password, loading]);

  const validateInput = () => {
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = 'Email is required';
    else if (!CONFIG.VALIDATION.EMAIL_REGEX.test(email.trim())) nextErrors.email = 'Enter a valid email address';
    if (!password.trim()) nextErrors.password = 'Password is required';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateInput()) return;

    setLoading(true);
    try {
      await login(email.trim(), password);
      showToast('Login successful', 'success');
    } catch (error: any) {
      showToast(error.message || CONFIG.ERRORS.UNAUTHORIZED, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen contentStyle={styles.centerContent}>
      <View style={styles.header}>
        <Text style={styles.logo}>WakeSafe</Text>
        <Text style={styles.subtitle}>Driver safety and fatigue detection</Text>
      </View>

      <Card style={styles.card}>
        <InputField
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={errors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          autoFocus
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
        />

        <InputField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
          placeholder="Enter your password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          editable={!loading}
        />

        <Button title="Sign in" onPress={handleLogin} loading={loading} disabled={isDisabled} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>No account yet?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.linkText}> Create one</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  centerContent: { justifyContent: 'center' },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    fontSize: typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  footerText: {
    fontSize: typography.caption,
    color: colors.textMuted,
  },
  linkText: {
    fontSize: typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
});
