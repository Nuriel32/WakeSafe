import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { CONFIG } from '../../config';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { InputField } from '../../components/ui/InputField';
import { Button } from '../../components/ui/Button';
import { colors, spacing, typography } from '../../theme/tokens';
import { useToast } from '../../components/feedback/ToastProvider';

interface RegisterScreenProps {
  navigation: any;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    carNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { register } = useAuth();
  const { showToast } = useToast();

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isDisabled = useMemo(() => {
    return Object.values(formData).some((value) => !value.trim()) || loading;
  }, [formData, loading]);

  const validateInput = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) nextErrors.email = 'Email is required';
    else if (!CONFIG.VALIDATION.EMAIL_REGEX.test(formData.email)) nextErrors.email = 'Enter a valid email address';
    if (!formData.password.trim()) nextErrors.password = 'Password is required';
    else if (formData.password.length < CONFIG.VALIDATION.PASSWORD_MIN_LENGTH) {
      nextErrors.password = `Use at least ${CONFIG.VALIDATION.PASSWORD_MIN_LENGTH} characters`;
    }
    if (!formData.phone.trim()) nextErrors.phone = 'Phone is required';
    else if (!CONFIG.VALIDATION.PHONE_REGEX.test(formData.phone)) nextErrors.phone = 'Use 05XXXXXXXX format';
    if (!formData.carNumber.trim()) nextErrors.carNumber = 'Car number is required';
    else if (!CONFIG.VALIDATION.CAR_NUMBER_REGEX.test(formData.carNumber)) nextErrors.carNumber = 'Use 7-8 digits';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateInput()) return;

    setLoading(true);
    try {
      await register(formData);
      showToast('Account created successfully', 'success');
    } catch (error: any) {
      showToast(error.message || CONFIG.ERRORS.VALIDATION, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Set up WakeSafe in under a minute</Text>
      </View>

      <Card style={styles.form}>
        <View style={styles.row}>
          <View style={styles.half}>
            <InputField
              label="First name"
              value={formData.firstName}
              onChangeText={(value) => updateFormData('firstName', value)}
              error={errors.firstName}
              placeholder="Uriel"
              autoCapitalize="words"
              returnKeyType="next"
              autoFocus
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!loading}
            />
          </View>
          <View style={styles.half}>
            <InputField
              label="Last name"
              value={formData.lastName}
              onChangeText={(value) => updateFormData('lastName', value)}
              error={errors.lastName}
              placeholder="Levi"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!loading}
            />
          </View>
        </View>

        <InputField
          ref={emailRef}
          label="Email"
          value={formData.email}
          onChangeText={(value) => updateFormData('email', value)}
          error={errors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
        />

        <InputField
          ref={passwordRef}
          label="Password"
          value={formData.password}
          onChangeText={(value) => updateFormData('password', value)}
          error={errors.password}
          placeholder={`At least ${CONFIG.VALIDATION.PASSWORD_MIN_LENGTH} characters`}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <InputField
          label="Phone"
          value={formData.phone}
          onChangeText={(value) => updateFormData('phone', value)}
          error={errors.phone}
          placeholder="05XXXXXXXX"
          keyboardType="phone-pad"
          maxLength={10}
          editable={!loading}
        />

        <InputField
          label="Car number"
          value={formData.carNumber}
          onChangeText={(value) => updateFormData('carNumber', value)}
          error={errors.carNumber}
          placeholder="1234567"
          keyboardType="numeric"
          maxLength={8}
          editable={!loading}
        />

        <Button title="Create account" onPress={handleRegister} loading={loading} disabled={isDisabled} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}> Sign in</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: { flex: 1 },
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
