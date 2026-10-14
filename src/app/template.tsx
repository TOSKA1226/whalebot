/** 模板：把助手包导出成文本（复制/分享），或把别人的模板导进来 */
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import { bundleToText, exportTemplate, importTemplate } from '../template';
import { Btn, Header, SectionTitle } from '../ui';

export default function TemplateScreen() {
  const { t, cfg, reloadData, refreshAgentKeys } = useApp();
  const [name, setName] = useState('我的助手包');
  const [text, setText] = useState('');
  const [incoming, setIncoming] = useState('');
  const [msg, setMsg] = useState('');
  const [withMemories, setWithMemories] = useState(true);

  const generate = async () => {
    const b = await exportTemplate(name, {
      groupProviders: cfg.groupProviders,
      groupColors: cfg.groupColors,
    });
    setText(bundleToText(b));
    setMsg(t('tpl.generated', { n: b.agents.length }));
  };

  const copy = async () => {
    await Clipboard.setStringAsync(text || '');
    setMsg(t('tpl.copied'));
  };

  const share = async () => {
    try {
      await Share.share({ message: text || '' });
    } catch {
      // 用户取消分享，忽略
    }
  };

  const doImport = async () => {
    setMsg('');
    try {
      const r = await importTemplate(incoming, { includeMemories: withMemories });
      await refreshAgentKeys();
      await reloadData();
      setMsg(
        t('tpl.done', {
          a: r.agents,
          s: r.skills,
          r: r.routines,
          m: r.memories,
          p: r.providers,
        }) + (r.merged.length ? ` ${t('tpl.merged', { names: r.merged.join('、') })}` : ''),
      );
      setIncoming('');
    } catch (e: any) {
      setMsg(t('tpl.fail', { e: String(e?.message ?? e) }));
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header title={t('tpl.title')} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.hint}>{t('tpl.hint')}</Text>

        <SectionTitle>{t('tpl.name')}</SectionTitle>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="我的助手包" placeholderTextColor="#9a9a9e" />
        <Btn label={t('tpl.export')} onPress={() => void generate()} style={{ marginTop: 10 }} />

        {text ? (
          <>
            <TextInput
              style={[s.input, s.big]}
              value={text}
              onChangeText={() => {
                /* 只读展示，允许手动选择复制 */
              }}
              multiline
              editable={false}
            />
            <View style={s.row}>
              <Btn label={t('tpl.copy')} kind="ghost" onPress={() => void copy()} style={{ flex: 1 }} />
              <Btn label={t('tpl.share')} kind="ghost" onPress={() => void share()} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}

        <SectionTitle>{t('tpl.import')}</SectionTitle>
        <TextInput
          style={[s.input, s.big]}
          value={incoming}
          onChangeText={setIncoming}
          multiline
          placeholder={t('tpl.importHint')}
          placeholderTextColor="#9a9a9e"
        />
        <TouchableOpacity style={s.checkRow} onPress={() => setWithMemories((v) => !v)}>
          <Text style={s.check}>{withMemories ? '☑' : '☐'}</Text>
          <Text style={s.checkTxt}>{t('tpl.includeMemories')}</Text>
        </TouchableOpacity>
        <Btn label={t('tpl.import')} onPress={() => void doImport()} style={{ marginTop: 10 }} />

        {msg ? <Text style={s.msg}>{msg}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
  },
  big: { height: 150, marginTop: 12, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 11 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  check: { fontSize: 16, color: '#0a84ff' },
  checkTxt: { fontSize: 13, color: '#333' },
  msg: { fontSize: 12, color: '#0a84ff', marginTop: 12, lineHeight: 18 },
});
