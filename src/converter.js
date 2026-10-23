/* SPDX-License-Identifier: GPL-3.0-only WITH GPL-3.0-linking-exception */
(() => {
  'use strict';
  const PROJECT_BYTES = 4064;
  const TUNED_BYTES = 4264;
  const PROJECT_HEADER = 16;
  const MAX_MIDI_BYTES = 16 * 1024 * 1024;
  const MAX_NOTES = 100000;
  const STEP_COUNT = 64;
  const PRESET_REGION = 2048;
  const TEMPO_OFFSET = 3832;
  const NAME_OFFSET = 3836;
  const SEQUENCE_OFFSET = 3852;
  const CHORD_OFFSET = 3856;
  const LOCK_OFFSET = 3984;
  const ARP_OFFSET = 4048;
  const SOURCE_NAMES = ['DX7', '303', '808', 'PSG', 'PLUCK', 'SAMPLER'];
  const DX7_OPERATOR_MAX = [99,99,99,99,99,99,99,99,99,99,99,3,3,7,3,7,99,1,31,99,14];
  const DX7_GLOBAL_MAX = [99,99,99,99,99,99,99,99,31,7,1,99,99,99,99,1,5,7,48];
  const SIMPLE_MAX = {3:[3,31,48,127], 5:[127,48,127,4,3,127]};
  const DRUM_PADS = new Map([
    [35,0],[36,0],[37,5],[38,1],[39,6],[40,1],[41,2],[42,10],[43,2],[44,10],[45,3],
    [46,9],[47,3],[48,4],[49,8],[50,4],[51,8],[52,8],[53,7],[54,6],[55,8],[56,7],
    [57,8],[58,7],[59,8],[60,2],[61,3],[62,2],[63,3],[64,3],[65,4],[66,7],[67,7],
    [68,8],[69,10],[73,5],[74,5],[78,8],[79,8],[80,10],[81,10]
  ]);
  const $ = id => document.getElementById(id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const bytesToAscii = bytes => String.fromCharCode(...bytes);
  const translate = value => globalThis.FM1I18n?.t(value) ?? value;

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (~crc) >>> 0;
  }

  function readTemplate(file) {
    assert(file instanceof Uint8Array, '项目模板数据无效');
    assert(file.length === PROJECT_HEADER + PROJECT_BYTES || file.length === PROJECT_HEADER + TUNED_BYTES,
      '项目模板长度无效；只支持 4064 字节 V4 项目及可选调音块');
    assert(bytesToAscii(file.subarray(0, 4)) === 'FM1P' && file[4] === 4 &&
      file[5] === 0 && file[6] === 0 && file[7] === 0, '项目模板必须是 FM1P V4 格式');
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const payloadLength = file.length - PROJECT_HEADER;
    assert(view.getUint32(8, true) === payloadLength, '项目模板 payload 长度不匹配');
    const payload = file.slice(PROJECT_HEADER);
    assert(view.getUint32(12, true) === crc32(payload), '项目模板 CRC32 校验失败');
    assert(payload[SEQUENCE_OFFSET] === 4, '项目模板序列版本无效');
    validatePayload(payload);
    if (payload.length === TUNED_BYTES) {
      const block = payload.subarray(PROJECT_BYTES);
      const tuning = new DataView(block.buffer, block.byteOffset, block.byteLength);
      assert(bytesToAscii(block.subarray(0, 4)) === 'FM1T' &&
        tuning.getUint32(196, true) === crc32(block.subarray(0, 196)) &&
        !block.subarray(4, 196).includes(128), '项目模板的调音数据或 CRC32 无效');
    }
    return { payload, tuned: payload.length === TUNED_BYTES };
  }

  function validatePayload(payload) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const tempo = view.getUint16(TEMPO_OFFSET, true);
    assert(tempo >= 30 && tempo <= 300, '项目模板速度超出 FM1 范围');
    for (const byte of payload.subarray(NAME_OFFSET, NAME_OFFSET + 12))
      assert(byte >= 32 && byte <= 126, '项目模板名称含无效字符');
    for (const byte of payload.subarray(3848, SEQUENCE_OFFSET))
      assert(byte <= 127, '项目模板效果参数无效');
    assert(payload[SEQUENCE_OFFSET + 1] <= 50 && payload[SEQUENCE_OFFSET + 2] <= 2 &&
      payload[SEQUENCE_OFFSET + 3] <= 1, '项目模板节奏配置无效');

    const types = [];
    for (let track = 0; track < 8; track++) {
      const preset = PRESET_REGION + track * 223;
      const type = payload[preset];
      types.push(type);
      assert(type <= 5 && payload[preset + 1] <= 127 && payload[preset + 3] <= 1 &&
        payload[preset + 4] <= 100 && payload[preset + 5] <= 100 &&
        payload[preset + 6] <= 100 && payload[preset + 7] <= 100 &&
        payload[preset + 8] <= 1 && payload[preset + 9] <= 63 &&
        payload[preset + 10] <= 1 && payload[preset + 221] <= 3 &&
        payload[preset + 222] === (type === 5 ? 8 : 0), '项目模板含无效轨道预设');
      const maxProgram = type === 0 ? 16 : type === 1 ? 2 : type === 3 ? 4 : 1;
      assert(payload[preset + 2] < maxProgram, '项目模板音色编号无效');
      if (type === 0) {
        for (let parameter = 0; parameter < 156; parameter++) {
          const max = parameter < 126 ? DX7_OPERATOR_MAX[parameter % 21]
            : parameter < 145 ? DX7_GLOBAL_MAX[parameter - 126]
              : parameter === 155 ? 63 : 127;
          assert(payload[preset + 11 + parameter] <= max, '项目模板 DX7 参数无效');
        }
      } else if (type === 1) {
        assert(payload[preset + 2] === payload[preset + 11 + 5] && payload[preset + 11 + 5] <= 1,
          '项目模板 303 音色编号无效');
      } else if (SIMPLE_MAX[type]) {
        for (let parameter = 0; parameter < SIMPLE_MAX[type].length; parameter++)
          assert(payload[preset + 11 + parameter] <= SIMPLE_MAX[type][parameter], '项目模板音源参数无效');
        if (type === 3) assert(payload[preset + 2] === payload[preset + 11], '项目模板 PSG 音色编号无效');
      }
      if (type !== 0 && payload[preset + 8]) {
        assert(payload[preset + 6] <= 1 && payload[preset + 7] <= 3, '项目模板音源包络无效');
      }
      assert((payload[ARP_OFFSET + track * 2 + 1] & 63) <= 50, '项目模板琶音 swing 无效');
    }

    const chords = [];
    for (let chord = 0; chord < 16; chord++) {
      const values = payload.subarray(CHORD_OFFSET + chord * 8, CHORD_OFFSET + (chord + 1) * 8);
      const count = values[0];
      assert(count === 0 || (count >= 2 && count <= 8), '项目模板和弦表无效');
      for (let i = 1; i < 8; i++) {
        if (i < count) assert(values[i] > 0 && values[i] <= 127 && (i === 1 || values[i] > values[i - 1]),
          '项目模板和弦音程无效');
        else assert(values[i] === 0, '项目模板和弦表尾部无效');
      }
      chords.push(values.slice());
    }

    for (let track = 0; track < 8; track++) {
      const type = types[track];
      for (let step = 0; step < STEP_COUNT; step++) {
        const at = track * STEP_COUNT * 4 + step * 4;
        const note = payload[at], velocity = payload[at + 1], drums = view.getUint16(at + 2, true);
        assert(note <= 127 && velocity <= 127, '项目模板步进音符无效');
        if (type === 2 || type === 5) {
          assert((note & 15) === 0 && (type !== 5 || (drums >>> 8) === 0) &&
            (type !== 2 || (drums >>> 11) === 0), '项目模板鼓步进无效');
        } else {
          const chord = drums & 31;
          assert((drums & 0xc000) === 0 && chord <= 16 && (!chord || chords[chord - 1][0] > 0),
            '项目模板旋律步进无效');
          if (chord) assert(note + chords[chord - 1][chords[chord - 1][0] - 1] <= 127,
            '项目模板和弦音域无效');
        }
      }
    }

    const lockSteps = new Set();
    for (let index = 0; index < 16; index++) {
      const at = LOCK_OFFSET + index * 4;
      const track = payload[at];
      if (track === 255) continue;
      assert(track < 8 && payload[at + 1] < STEP_COUNT && payload[at + 3] <= 127,
        '项目模板步进参数锁无效');
      const type = types[track];
      const limit = type === 0 ? 145 : type === 1 ? 12 : type === 5 ? 48 : type === 2 ? 1 : 4;
      assert(payload[at + 2] < limit, '项目模板参数锁编号无效');
      const key = track * STEP_COUNT + payload[at + 1];
      assert(!lockSteps.has(key), '项目模板存在重复参数锁');
      lockSteps.add(key);
    }
    return types;
  }

  function parseMidi(bytes) {
    assert(bytes instanceof Uint8Array && bytes.length >= 14 && bytes.length <= MAX_MIDI_BYTES,
      'MIDI 文件长度无效或超过 16 MiB');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const asciiAt = (offset, length) => bytesToAscii(bytes.subarray(offset, offset + length));
    assert(asciiAt(0, 4) === 'MThd', 'MIDI 文件缺少 MThd 头');
    const headerLength = view.getUint32(4, false);
    assert(headerLength >= 6 && 8 + headerLength <= bytes.length, 'MIDI 文件头长度无效');
    const format = view.getUint16(8, false);
    const trackCount = view.getUint16(10, false);
    const division = view.getUint16(12, false);
    assert(format === 0 || format === 1, '只支持 MIDI 格式 0 或 1');
    assert(trackCount > 0 && trackCount <= 64 && (format !== 0 || trackCount === 1),
      'MIDI 轨道数量或格式无效');
    assert(division > 0 && (division & 0x8000) === 0, '只支持 PPQN MIDI 时间格式，不支持 SMPTE');
    const notes = [], tempos = [], signatures = [];
    let cursor = 8 + headerLength, noteCount = 0, unclosed = 0, order = 0;
    for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
      assert(cursor + 8 <= bytes.length && asciiAt(cursor, 4) === 'MTrk', 'MIDI 轨道块缺失或无效');
      const chunkLength = view.getUint32(cursor + 4, false);
      const start = cursor + 8, end = start + chunkLength;
      assert(end <= bytes.length, 'MIDI 轨道数据被截断');
      cursor = start;
      let runningStatus = 0, tick = 0, ended = false, trackName = '';
      const open = new Map();
      const dataByte = () => {
        assert(cursor < end && bytes[cursor] < 128, 'MIDI 事件数据字节无效');
        return bytes[cursor++];
      };
      const variableLength = () => {
        let value = 0;
        for (let count = 0; count < 4; count++) {
          assert(cursor < end, 'MIDI 可变长度数值被截断');
          const byte = bytes[cursor++];
          value = value * 128 + (byte & 127);
          if (!(byte & 128)) return value;
        }
        throw new Error('MIDI 可变长度数值超过 4 字节');
      };
      while (cursor < end) {
        tick += variableLength();
        assert(Number.isSafeInteger(tick), 'MIDI 时间位置超出安全范围');
        let status = bytes[cursor];
        if (status < 128) {
          assert(runningStatus >= 0x80 && runningStatus <= 0xef, 'MIDI running status 无效');
          status = runningStatus;
        } else {
          cursor++;
          if (status >= 0x80 && status <= 0xef) runningStatus = status;
        }
        if (status >= 0x80 && status <= 0xef) {
          const kind = status & 0xf0, channel = status & 15;
          const first = dataByte();
          const second = kind === 0xc0 || kind === 0xd0 ? 0 : dataByte();
          if (kind === 0x90 && second > 0) {
            noteCount++;
            assert(noteCount <= MAX_NOTES, 'MIDI 音符数量超过 100,000');
            const note = {track:trackIndex, channel, pitch:first, velocity:second, startTick:tick,
              endTick:null, order:order++};
            notes.push(note);
            const key = channel * 128 + first, queue = open.get(key) || [];
            queue.push(note);
            open.set(key, queue);
          } else if (kind === 0x80 || (kind === 0x90 && second === 0)) {
            const queue = open.get(channel * 128 + first);
            if (queue?.length) {
              queue.shift().endTick = tick;
              if (!queue.length) open.delete(channel * 128 + first);
            }
          }
          continue;
        }
        if (status === 0xff) {
          assert(cursor < end, 'MIDI meta 事件不完整');
          const type = bytes[cursor++], length = variableLength(), dataEnd = cursor + length;
          assert(dataEnd <= end, 'MIDI meta 事件长度超出轨道');
          if (type === 0x2f) {
            assert(length === 0 && dataEnd === end, 'MIDI 结束标记无效或后面仍有数据');
            ended = true;
            cursor = dataEnd;
            break;
          }
          if (type === 0x51) {
            assert(length === 3, 'MIDI tempo 事件长度无效');
            const micros = (bytes[cursor] << 16) | (bytes[cursor + 1] << 8) | bytes[cursor + 2];
            assert(micros > 0, 'MIDI tempo 事件无效');
            tempos.push({tick, micros, order:order++});
          } else if (type === 0x58 && length >= 4) {
            signatures.push({tick, numerator:bytes[cursor], denominator:2 ** bytes[cursor + 1], order:order++});
          } else if (type === 0x03) {
            trackName = String.fromCharCode(...bytes.subarray(cursor, dataEnd)).replace(/[^\x20-\x7e]/g, '');
          }
          cursor = dataEnd;
          continue;
        }
        if (status === 0xf0 || status === 0xf7) {
          const length = variableLength();
          assert(cursor + length <= end, 'MIDI SysEx 事件长度超出轨道');
          cursor += length;
          runningStatus = 0;
          continue;
        }
        throw new Error('MIDI 文件包含不支持的 system 事件');
      }
      assert(ended, 'MIDI 轨道缺少结束标记');
      for (const queue of open.values()) for (const note of queue) {
        note.endTick = tick;
        unclosed++;
      }
      for (const note of notes) if (note.track === trackIndex) note.trackName = trackName;
      cursor = end;
    }
    assert(cursor === bytes.length, 'MIDI 文件包含无法识别的尾随数据');
    tempos.sort((a,b)=>a.tick-b.tick||a.order-b.order);
    signatures.sort((a,b)=>a.tick-b.tick||a.order-b.order);
    return {format, division, notes, tempos, signatures, unclosed};
  }

  function convert(midi, templateFile, projectName) {
    const template = readTemplate(templateFile);
    const payload = template.payload.slice();
    const types = validatePayload(payload);
    assert(typeof projectName === 'string' && projectName.length > 0 && projectName.length <= 12 &&
      /^[\x20-\x7e]+$/.test(projectName), '项目名称须为 1–12 个 ASCII 可打印字符');

    const warnings = [];
    const stepTicks = midi.division / 4;
    const tempoEvent = midi.tempos[0];
    let tempo = tempoEvent ? Math.round(60000000 / tempoEvent.micros) : 120;
    if (tempo < 30 || tempo > 300) {
      warnings.push('MIDI 速度超出 FM1 范围，已限制到 30–300 BPM');
      tempo = Math.max(30, Math.min(300, tempo));
    }
    if (midi.tempos.some(event => event.micros !== (tempoEvent?.micros ?? 500000)))
      warnings.push('MIDI 含有速度变化；FM1 项目使用首个速度，后续速度事件未保留');
    if (midi.signatures.some(event => event.numerator !== 4 || event.denominator !== 4))
      warnings.push('MIDI 含有非 4/4 拍号；步进仍按每个四分音符 4 步解析');
    if (midi.unclosed) warnings.push(`${translate('未关闭的 MIDI 音符')}: ${midi.unclosed} · ${translate('按轨道结束位置关闭')}`);

    for (let track = 0; track < 8; track++) {
      const type = types[track], isDrum = type === 2 || type === 5;
      for (let step = 0; step < STEP_COUNT; step++) {
        const at = track * STEP_COUNT * 4 + step * 4;
        payload[at] = isDrum ? 0 : 60;
        payload[at + 1] = 0;
        payload[at + 2] = payload[at + 3] = 0;
      }
    }
    payload[3834] = 0;
    payload[3835] = 0;
    payload.fill(255, LOCK_OFFSET, LOCK_OFFSET + 16 * 4);
    const encodedName = new TextEncoder().encode(projectName);
    payload.fill(32, NAME_OFFSET, NAME_OFFSET + 12);
    payload.set(encodedName, NAME_OFFSET);
    new DataView(payload.buffer).setUint16(TEMPO_OFFSET, tempo, true);

    const melodicTracks = types.flatMap((type, track) => type !== 2 && type !== 5 ? [track] : []);
    const drumTrack = types.indexOf(2);
    const voices = new Map();
    for (const note of midi.notes) {
      const kind = note.channel === 9 ? 'drum' : 'melody';
      const key = `${kind}:${note.track}:${note.channel}`;
      if (!voices.has(key)) voices.set(key, {kind, track:note.track, channel:note.channel, notes:[]});
      voices.get(key).notes.push(note);
    }
    const melodyVoices = [...voices.values()].filter(voice => voice.kind === 'melody');
    const drumVoices = [...voices.values()].filter(voice => voice.kind === 'drum');
    const melodyMap = new Map();
    melodyVoices.forEach((voice, index) => {
      if (index < melodicTracks.length) melodyMap.set(voice, melodicTracks[index]);
    });
    const mappedMelody = [];
    let writtenMelody = 0, trimmedNotes = 0, quantizedNotes = 0, chordOverflow = 0;
    const chordIds = new Map();
    const chordUsed = new Set();
    for (const voice of melodyVoices) {
      const track = melodyMap.get(voice);
      if (track === undefined) continue;
      const notesBeforeTrack = writtenMelody;
      payload[PRESET_REGION + track * 223 + 221] = 0;
      const events = [];
      for (const note of voice.notes) {
        const startStep = Math.round(note.startTick / stepTicks);
        if (startStep >= STEP_COUNT) { trimmedNotes++; continue; }
        const rawEnd = Math.max(note.startTick + 1, note.endTick ?? note.startTick + stepTicks);
        if (rawEnd > STEP_COUNT * stepTicks) trimmedNotes++;
        if (Math.abs(note.startTick - startStep * stepTicks) > 0.001 ||
          Math.abs(rawEnd / stepTicks - Math.round(rawEnd / stepTicks)) > 0.001) quantizedNotes++;
        const endStep = Math.max(startStep + 1, Math.ceil(Math.min(rawEnd, STEP_COUNT * stepTicks) / stepTicks - 1e-9));
        events.push({...note, startStep, endStep, endTick:Math.min(rawEnd, STEP_COUNT * stepTicks)});
      }
      for (let step = 0; step < STEP_COUNT; step++) {
        const active = events.filter(note => note.startStep <= step && note.endStep > step);
        if (!active.length) continue;
        const byPitch = new Map();
        for (const note of active) {
          const previous = byPitch.get(note.pitch);
          if (!previous || note.velocity > previous.velocity) byPitch.set(note.pitch, note);
        }
        let pitches = [...byPitch.values()];
        if (pitches.length > 8) {
          chordOverflow += pitches.length - 8;
          pitches = pitches.sort((a,b)=>b.velocity-a.velocity||a.pitch-b.pitch).slice(0,8);
        }
        pitches.sort((a,b)=>a.pitch-b.pitch);
        if (!pitches.length) continue;
        const at = track * STEP_COUNT * 4 + step * 4;
        const root = pitches[0].pitch;
        let chordId = 0;
        if (pitches.length > 1) {
          const offsets = pitches.slice(1).map(note => note.pitch - root);
          const signature = offsets.join(',');
          chordId = chordIds.get(signature) || 0;
          if (!chordId) {
            const existing = payload.subarray(CHORD_OFFSET, CHORD_OFFSET + 128);
            for (let index = 0; index < 16; index++) {
              const chord = existing.subarray(index * 8, index * 8 + 8);
              if (chord[0] === pitches.length && offsets.every((offset, i) => chord[i + 1] === offset)) {
                chordId = index + 1;
                break;
              }
            }
          }
          if (chordId) {
            chordIds.set(signature, chordId);
            chordUsed.add(chordId - 1);
          } else {
            let index = 0;
            while (index < 16 && chordUsed.has(index)) index++;
            if (index < 16) {
              chordId = index + 1;
              const chord = new Uint8Array(8);
              chord[0] = pitches.length;
              offsets.forEach((offset, i) => { chord[i + 1] = offset; });
              payload.set(chord, CHORD_OFFSET + index * 8);
              chordIds.set(signature, chordId);
              chordUsed.add(index);
            } else {
              chordOverflow += pitches.length - 1;
              pitches = pitches.slice(0, 1);
            }
          }
        }
        const nextPitches = new Set(events.filter(note => note.startStep <= step + 1 && note.endStep > step + 1).map(note => note.pitch));
        const tied = pitches.some(note => nextPitches.has(note.pitch));
        const finalEnd = Math.max(...pitches.map(note => note.endTick));
        const gate = tied ? 15 : Math.max(1, Math.min(15,
          Math.ceil((finalEnd - step * stepTicks) * 16 / stepTicks - 1e-9)));
        const velocity = Math.max(...pitches.map(note => note.velocity));
        payload[at] = pitches[0].pitch;
        payload[at + 1] = velocity;
        new DataView(payload.buffer).setUint16(at + 2, chordId | (gate << 5) | (tied ? 0x1000 : 0), true);
        writtenMelody += pitches.length;
      }
      if (writtenMelody > notesBeforeTrack) mappedMelody.push({voice, track});
    }

    const unmappedMelody = melodyVoices.filter(voice => !melodyMap.has(voice));
    const unmappedVoices = unmappedMelody.length;
    const unmappedNotes = unmappedMelody.reduce((sum, voice) => sum + voice.notes.length, 0);
    if (unmappedVoices) warnings.push(`${translate('旋律声部因模板无可用音源轨而跳过')}: ${unmappedVoices} (${unmappedNotes} ${translate('写入音符')})`);
    if (trimmedNotes) warnings.push(`${translate('旋律音符被截断')}: ${trimmedNotes}`);
    if (quantizedNotes) warnings.push(`${translate('旋律音符被量化')}: ${quantizedNotes}`);
    if (chordOverflow) warnings.push(`${translate('和弦音被省略')}: ${chordOverflow}`);

    let writtenDrums = 0, unmappedDrums = 0, mergedDrums = 0, truncatedDrums = 0, quantizedDrums = 0;
    const drumHits = new Map();
    if (drumTrack >= 0) {
      payload[PRESET_REGION + drumTrack * 223 + 221] = 0;
      for (const voice of drumVoices) for (const note of voice.notes) {
        const step = Math.round(note.startTick / stepTicks);
        if (step >= STEP_COUNT) { truncatedDrums++; continue; }
        if (Math.abs(note.startTick - step * stepTicks) > 0.001) quantizedDrums++;
        const pad = DRUM_PADS.get(note.pitch);
        if (pad === undefined) { unmappedDrums++; continue; }
        const key = step;
        const hit = drumHits.get(key) || {mask:0, velocity:0, pads:new Set(), velocities:new Set()};
        if (hit.pads.has(pad)) mergedDrums++;
        hit.pads.add(pad);
        hit.velocities.add(note.velocity);
        hit.mask |= 1 << pad;
        hit.velocity = Math.max(hit.velocity, note.velocity);
        drumHits.set(key, hit);
        writtenDrums++;
      }
      for (const [step, hit] of drumHits) {
        const at = drumTrack * STEP_COUNT * 4 + step * 4;
        payload[at] = 0;
        payload[at + 1] = hit.velocity;
        new DataView(payload.buffer).setUint16(at + 2, hit.mask, true);
      }
    } else if (drumVoices.length) {
      const unavailableDrums = drumVoices.reduce((sum, voice) => sum + voice.notes.length, 0);
      warnings.push(`${translate('模板没有 808 轨，鼓音符未映射')}: ${unavailableDrums}`);
    }
    if (truncatedDrums) warnings.push(`${translate('鼓音符被截断')}: ${truncatedDrums}`);
    if (quantizedDrums) warnings.push(`${translate('鼓音符被量化')}: ${quantizedDrums}`);
    if (unmappedDrums && drumTrack >= 0) warnings.push(`${translate('MIDI 鼓音符未映射')}: ${unmappedDrums}`);
    if (mergedDrums) warnings.push(`${translate('同一鼓垫／步进的重复触发已合并')}: ${mergedDrums}`);
    const sharedDrumVelocitySteps = [...drumHits.values()]
      .filter(hit => hit.velocities.size > 1).length;
    if (sharedDrumVelocitySteps)
      warnings.push(`${translate('同一步 FM1 鼓垫共用力度，已采用最高值')}: ${sharedDrumVelocitySteps}`);

    const outputPayload = payload;
    validatePayload(outputPayload);
    const result = createProjectFile(outputPayload);
    readTemplate(result);
    const maps = mappedMelody.map(({voice, track}) => {
      const sourceTrack = voice.trackName ? ` · ${voice.trackName}` : '';
      return `MIDI ${voice.track + 1} / CH ${voice.channel + 1}${sourceTrack} → FM1 ${String(track + 1).padStart(2,'0')} · ${SOURCE_NAMES[types[track]]}`;
    });
    if (writtenDrums && drumTrack >= 0)
      maps.push(`${drumVoices.length} ${translate('MIDI 鼓声部合并')} → FM1 ${String(drumTrack + 1).padStart(2,'0')} · 808`);
    const usedTracks = new Set(mappedMelody.map(item => item.track));
    if (writtenDrums && drumTrack >= 0) usedTracks.add(drumTrack);
    return {file:result, tempo, melodyTracks:usedTracks.size - (writtenDrums ? 1 : 0), drumTracks:writtenDrums ? 1 : 0,
      writtenNotes:writtenMelody + writtenDrums, trackSummary:maps, warnings, tuned:template.tuned};
  }

  function createProjectFile(payload) {
    const file = new Uint8Array(PROJECT_HEADER + payload.length);
    const view = new DataView(file.buffer);
    file.set([70,77,49,80,4,0,0,0]);
    view.setUint32(8, payload.length, true);
    view.setUint32(12, crc32(payload), true);
    file.set(payload, PROJECT_HEADER);
    return file;
  }

  function initUI() {
    if (typeof document === 'undefined' || !$('convert-midi-drop')) return;
    let midiFile = null, templateFile = null, convertedFile = null, userChangedName = false, busy = false;
    const strings = {
      midiTitle: '选择或拖入 MIDI 文件',
      templateTitle: '选择 FM1 项目模板',
      midiHint: '.mid / .midi · 最多 16 MiB',
      templateHint: 'V4 .fm1 · 保留音色与效果'
    };
    function clearResult() {
      convertedFile = null;
      $('convert-result').hidden = true;
      $('convert-feedback').dataset.error = 'false';
      $('convert-feedback').textContent = '';
    }
    function refresh() {
      $('convert-run').disabled = busy || !midiFile || !templateFile;
      $('convert-midi-drop').disabled = busy;
      $('convert-template-drop').disabled = busy;
      $('convert-midi-file').disabled = busy;
      $('convert-template-file').disabled = busy;
      $('convert-project-name').disabled = busy;
      $('convert-midi-title').textContent = midiFile?.name || translate(strings.midiTitle);
      $('convert-midi-name').textContent = midiFile ? `${(midiFile.size / 1024).toFixed(1)} KiB` : translate(strings.midiHint);
      $('convert-template-title').textContent = templateFile?.name || translate(strings.templateTitle);
      $('convert-template-name').textContent = templateFile ? `${(templateFile.size / 1024).toFixed(1)} KiB` : translate(strings.templateHint);
      if (midiFile && !userChangedName) $('convert-project-name').value = defaultName(midiFile.name);
    }
    function defaultName(name) {
      const stem = name.replace(/\.[^.]+$/, '');
      return stem.replace(/[^\x20-\x7e]/g, '_').trim().slice(0, 12) || 'MIDI IMPORT';
    }
    function status(message, error = false) {
      const node = $('convert-feedback');
      node.textContent = translate(message);
      node.dataset.error = String(error);
      node.setAttribute('role', error ? 'alert' : 'status');
      node.setAttribute('aria-live', error ? 'assertive' : 'polite');
    }
    function acceptFile(file, kind) {
      if (!file) return;
      if (busy) return;
      clearResult();
      const extension = kind === 'midi' ? /\.(mid|midi)$/i : /\.fm1$/i;
      if (!extension.test(file.name)) {
        status(kind === 'midi' ? '请选择 .mid 或 .midi 文件' : '请选择 .fm1 项目模板', true);
        return;
      }
      if (kind === 'midi' && file.size > MAX_MIDI_BYTES) {
        status('MIDI 文件超过 16 MiB，无法安全解析', true);
        return;
      }
      if (kind === 'template' && file.size !== 4080 && file.size !== 4280) {
        status('模板必须是 4080 或 4280 字节的 V4 .fm1 项目', true);
        return;
      }
      if (kind === 'midi') {
        midiFile = file;
        if (!userChangedName) $('convert-project-name').value = defaultName(file.name);
      } else templateFile = file;
      status('文件已就绪；所有内容仅在浏览器本地处理');
      refresh();
    }
    for (const kind of ['midi', 'template']) {
      const zone = $(`convert-${kind}-drop`);
      const input = $(`convert-${kind}-file`);
      zone.addEventListener('click', () => input.click());
      zone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.click();
        }
      });
      input.addEventListener('change', () => {
        acceptFile(input.files?.[0], kind);
        input.value = '';
      });
      let depth = 0;
      zone.addEventListener('dragenter', event => {
        event.preventDefault();
        depth++;
        zone.classList.add('is-dragging');
      });
      zone.addEventListener('dragover', event => event.preventDefault());
      zone.addEventListener('dragleave', event => {
        event.preventDefault();
        depth = Math.max(0, depth - 1);
        if (!depth) zone.classList.remove('is-dragging');
      });
      zone.addEventListener('drop', event => {
        event.preventDefault();
        depth = 0;
        zone.classList.remove('is-dragging');
        acceptFile(event.dataTransfer?.files?.[0], kind);
      });
    }
    $('convert-project-name').addEventListener('input', () => {
      userChangedName = true;
      clearResult();
    });
    $('convert-run').addEventListener('click', async () => {
      if (busy || !midiFile || !templateFile) return;
      clearResult();
      busy = true;
      refresh();
      status('正在本地解析 MIDI 与校验 FM1 模板…');
      try {
        const currentMidi = midiFile, currentTemplate = templateFile;
        const [midiBuffer, templateBuffer] = await Promise.all([currentMidi.arrayBuffer(), currentTemplate.arrayBuffer()]);
        const midi = parseMidi(new Uint8Array(midiBuffer));
        const name = $('convert-project-name').value.trim();
        const result = convert(midi, new Uint8Array(templateBuffer), name);
        convertedFile = result.file;
        $('convert-stat-tempo').textContent = `${result.tempo} BPM`;
        $('convert-stat-melody').textContent = result.melodyTracks;
        $('convert-stat-drums').textContent = result.drumTracks;
        $('convert-stat-notes').textContent = result.writtenNotes;
        $('convert-track-summary').textContent = result.trackSummary.length
          ? result.trackSummary.join('\n')
          : translate('没有可映射的音符轨道');
        const warningList = $('convert-warnings');
        warningList.replaceChildren();
        for (const warning of result.warnings) {
          const item = document.createElement('li');
          item.textContent = warning;
          warningList.append(item);
        }
        warningList.hidden = result.warnings.length === 0;
        $('convert-result').hidden = false;
        status('FM1 项目已生成并通过 V4 容器、长度与 CRC32 复核');
      } catch (error) {
        status(error instanceof Error ? error.message : '转换失败；项目文件未生成', true);
      } finally {
        busy = false;
        refresh();
      }
    });
    $('convert-download').addEventListener('click', () => {
      assert(convertedFile, '没有可下载的转换结果');
      const blob = new Blob([convertedFile], {type:'application/octet-stream'});
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${$('convert-project-name').value.trim() || 'MIDI IMPORT'}.fm1`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.addEventListener('fm1-language-change', refresh);
    refresh();
  }

  globalThis.FM1MidiConverter = Object.freeze({crc32, readTemplate, validatePayload, parseMidi, convert});
  initUI();
})();
