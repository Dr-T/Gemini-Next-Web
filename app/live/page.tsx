'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';
import { PauseCircleOutlined, PoweroffOutlined } from '@ant-design/icons';
import MediaButtons from '@/components/media-buttons';
import { useLiveAPIContext } from '@/vendor/contexts/LiveAPIContext';
import {
    RealtimeInputMessage,
    ClientContentMessage,
    ServerContentMessage,
} from '@/vendor/multimodal-live-types';
import { base64sToArrayBuffer, pcmBufferToBlob } from '@/vendor/lib/utils';

import {
    Button,
    Layout,
    theme,
    Collapse,
    Input,
    Flex,
    Select,
    Tag,
    Checkbox,
} from 'antd';
import { Sender, Bubble } from '@ant-design/x';
import { useLocalStorageState } from 'ahooks';
import FieldItem from '@/components/field-item';
import GeminiIcon from '@/app/icon/google-gemini-icon.svg';
import Image from 'next/image';
import { GPTVis } from '@antv/gpt-vis';
import { Part } from '@google/generative-ai';

const { Header, Content } = Layout;

interface ToolsState {
    codeExecution: boolean;
    functionCalling: boolean;
    automaticFunctionResponse: boolean;
    grounding: boolean;
}

const fooAvatar: React.CSSProperties = {
    color: '#f56a00',
    backgroundColor: '#fde3cf',
};

const barAvatar: React.CSSProperties = {
    color: '#fff',
    backgroundColor: '#1677ff',
};

type MessageType =
    | RealtimeInputMessage
    | ClientContentMessage
    | ServerContentMessage
    | null;

const isClientMessage = (
    message: MessageType
): message is ClientContentMessage => {
    return message !== null && 'clientContent' in message;
};

const isServerMessage = (
    message: MessageType
): message is ServerContentMessage => {
    return message !== null && 'serverContent' in message;
};

const hasModelTurn = (
    content: ServerContentMessage['serverContent']
): content is { modelTurn: { parts: Part[] } } => {
    return 'modelTurn' in content && content.modelTurn !== null;
};

const MessageItem: React.FC<{ message: MessageType }> = ({ message }) => {
    const textComponent = useMemo(() => {
        if (isClientMessage(message)) {
            const content = message.clientContent.turns?.[0]?.parts
                .map((p) => p.text)
                .join('');
            return content ? (
                <Bubble
                    key={message.id}
                    placement='end'
                    content={<GPTVis>{content}</GPTVis>}
                    typing={{ step: 2, interval: 50 }}
                    avatar={{
                        icon: <UserOutlined />,
                        style: fooAvatar,
                    }}
                />
            ) : null;
        }

        if (isServerMessage(message) && hasModelTurn(message.serverContent)) {
            const content = message.serverContent.modelTurn.parts
                .map((p) => p?.text ?? '')
                .join('');
            return content ? (
                <Bubble
                    key={message.id}
                    placement='start'
                    content={<GPTVis>{content}</GPTVis>}
                    typing={{ step: 10, interval: 50 }}
                    avatar={{
                        icon: <RobotOutlined />,
                        style: barAvatar,
                    }}
                />
            ) : null;
        }
        return null;
    }, [message]);

    const audioComponent = useMemo(() => {
        if (isServerMessage(message) && hasModelTurn(message.serverContent)) {
            const audioParts = message.serverContent.modelTurn?.parts.filter(
                (p) => p.inlineData
            );
            if (audioParts.length) {
                const base64s = audioParts
                    .map((p) => p.inlineData?.data)
                    .filter((data): data is string => data !== undefined);
                const buffer = base64sToArrayBuffer(base64s);
                const blob = pcmBufferToBlob(buffer, 24000);
                const audioUrl = URL.createObjectURL(blob);
                return (
                    <Bubble
                        key={`audio-${message.id}`}
                        placement='start'
                        content={
                            <div>
                                <audio
                                    style={{
                                        height: 30,
                                    }}
                                    controls
                                    src={audioUrl}
                                />
                            </div>
                        }
                        avatar={{
                            icon: <RobotOutlined />,
                            style: barAvatar,
                        }}
                        styles={{
                            content: {
                                padding: 8,
                            },
                        }}
                    />
                );
            }
        }
        return null;
    }, [message]);

    return (
        <>
            {textComponent}
            {audioComponent}
        </>
    );
};

const LivePage: React.FC = () => {
    const {
        token: {
            colorBgLayout,
            colorFillAlter,
            borderRadiusLG,
            colorBgContainer,
        },
    } = theme.useToken();
    const videoRef = useRef<HTMLVideoElement>(null);
    // either the screen capture, the video or null, if null we hide it
    const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

    const {
        client,
        config,
        setConfig,
        connected,
        connect,
        disconnect,
        currentBotMessage,
        currentUserMessage,
    } = useLiveAPIContext();

    const [textInput, setTextInput] = useState('');

    const [prompt, setPrompt] = useLocalStorageState('prompt', {
        defaultValue: '',
    });
    const [model, setModel] = useLocalStorageState('model', {
        defaultValue: 'gemini-2.0-flash-exp',
    });
    const [outPut, setOutPut] = useLocalStorageState('output', {
        defaultValue: 'audio',
    });
    const [voice, setVoice] = useLocalStorageState('voice', {
        defaultValue: 'Puck',
    });

    const [tools, setTools] = useLocalStorageState<ToolsState>('tools', {
        defaultValue: {
            codeExecution: false,
            functionCalling: false,
            automaticFunctionResponse: false,
            grounding: false,
        },
    });

    const [toolsPaneActive, setToolsPaneActive] = useLocalStorageState<
        string[]
    >('tools-pane-active', {
        defaultValue: [],
    });

    const [messages, setMessages] = useState<MessageType[]>([]);

    const handleSubmit = () => {
        client.send([{ text: textInput }]);
        setTextInput('');
    };

    useEffect(() => {
        console.log('currentBotMessage', currentBotMessage);
        if (currentBotMessage) {
            setMessages((messages) => {
                if (
                    messages.filter((m) => m?.id === currentBotMessage?.id)
                        .length > 0
                ) {
                    return messages.map((m) =>
                        m?.id === currentBotMessage?.id ? currentBotMessage : m
                    );
                } else {
                    return [...messages, currentBotMessage];
                }
            });
        }
    }, [currentBotMessage]);

    useEffect(() => {
        console.log('currentUserMessage', currentUserMessage);
        if (currentUserMessage) {
            setMessages((messages) => {
                if (
                    messages.filter((m) => m?.id === currentUserMessage?.id)
                        .length > 0
                ) {
                    return messages.map((m) =>
                        m?.id === currentUserMessage?.id
                            ? currentUserMessage
                            : m
                    );
                } else {
                    return [...messages, currentUserMessage];
                }
            });
        }
    }, [currentUserMessage]);

    console.log('messages', messages);

    useEffect(() => {
        const speechConfig = {
            voiceConfig: {
                prebuiltVoiceConfig: {
                    voiceName: voice,
                },
            },
        };
        const generationConfig = {
            ...config?.generationConfig,
            speechConfig,
            responseModalities: outPut,
        } as typeof config.generationConfig;
        const systemInstruction = prompt
            ? { parts: [{ text: prompt }] }
            : undefined;
        setConfig({ ...config, generationConfig, systemInstruction });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, prompt, model, outPut, voice]);

    const panelStyle: React.CSSProperties = {
        background: colorFillAlter,
        borderRadius: borderRadiusLG,
        border: 'none',
    };

    const handleDisconnect = () => {
        setVideoStream(null);
        disconnect();
    };

    return (
        <Layout
            style={{
                height: '100vh',
            }}
        >
            <Header
                style={{
                    padding: '0 12px 0 24px',
                    background: colorBgLayout,
                    fontSize: 22,
                    fontWeight: 500,
                }}
            >
                实时流
            </Header>
            <Flex
                style={{
                    height: 'calc(100vh - 64px)',
                    overflow: 'hidden',
                }}
            >
                <Content
                    style={{
                        background: colorBgContainer,
                        borderRadius: 20,
                        flex: 1,
                        overflow: 'hidden',
                    }}
                >
                    <Flex style={{ height: '100%' }}>
                        <Flex
                            vertical
                            flex={1}
                            style={{
                                borderRadius: 20,
                                background: '#fff',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            <div className='px-5 py-2'>
                                <Collapse
                                    bordered={false}
                                    style={{ background: colorBgContainer }}
                                    items={[
                                        {
                                            key: 'prompts',
                                            label: '系统指令',
                                            children: (
                                                <Input
                                                    onChange={(e) =>
                                                        setPrompt(
                                                            e.target.value
                                                        )
                                                    }
                                                    value={prompt}
                                                    placeholder='为模型提供可选的语气和风格指令'
                                                />
                                            ),
                                            style: panelStyle,
                                        },
                                    ]}
                                />
                            </div>
                            <div
                                className='messages'
                                style={{
                                    flex: 1,
                                    padding: 24,
                                    overflowY: 'auto',
                                    boxSizing: 'border-box',
                                    borderRadius: 20,
                                    height: 0,
                                }}
                            >
                                <Flex gap='middle' vertical>
                                    {messages.map((m) => (
                                        <MessageItem key={m?.id} message={m} />
                                    ))}
                                </Flex>
                            </div>
                            <Flex justify='center'>
                                <Button
                                    color='primary'
                                    variant={connected ? 'outlined' : 'solid'}
                                    onClick={
                                        connected ? handleDisconnect : connect
                                    }
                                    icon={
                                        connected ? (
                                            <PauseCircleOutlined />
                                        ) : (
                                            <PoweroffOutlined />
                                        )
                                    }
                                >
                                    {connected
                                        ? '断开连接'
                                        : '点击我开始!'}
                                </Button>
                            </Flex>
                            <div
                                className='px-5 py-2'
                                style={{
                                    pointerEvents: !connected ? 'none' : 'auto',
                                }}
                            >
                                <Sender
                                    onChange={setTextInput}
                                    onSubmit={handleSubmit}
                                    value={textInput}
                                    disabled={!connected}
                                    prefix={
                                        <MediaButtons
                                            videoRef={videoRef}
                                            supportsVideo
                                            onVideoStreamChange={setVideoStream}
                                        />
                                    }
                                />
                                {videoStream ? (
                                    <video
                                        style={{
                                            position: 'absolute',
                                            top: 70,
                                            right: 20,
                                            maxWidth: 300,
                                            borderRadius: 10,
                                            border: '1px solid #333',
                                            display: !videoStream
                                                ? 'none'
                                                : 'auto',
                                        }}
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                    />
                                ) : null}
                            </div>
                        </Flex>
                    </Flex>
                </Content>
                <Flex
                    vertical
                    gap={32}
                    style={{
                        width: 250,
                        padding: '10px',
                        overflowY: 'auto',
                        background: colorBgLayout,
                    }}
                >
                    <div
                        style={{
                            fontSize: 16,
                            fontWeight: 500,
                        }}
                    >
                        运行设置
                    </div>
                    <FieldItem
                        label='模型'
                        icon={<Image src={GeminiIcon} alt={'模型'} />}
                    >
                        <Select
                            popupMatchSelectWidth={false}
                            onChange={setModel}
                            value={model}
                            options={[
                                {
                                    value: 'gemini-2.0-flash-exp',
                                    label: (
                                        <span>
                                            <span
                                                style={{
                                                    marginRight: 8,
                                                }}
                                            >
                                                Gemini 2.0 Flash 实验版
                                            </span>
                                            <Tag
                                                style={{
                                                    marginRight: 0,
                                                }}
                                                color='#87d068'
                                            >
                                                新
                                            </Tag>
                                        </span>
                                    ),
                                },
                            ]}
                        />
                    </FieldItem>
                    <FieldItem label='输出格式'>
                        <Select
                            onChange={setOutPut}
                            value={outPut}
                            options={[
                                {
                                    value: 'audio',
                                    label: <span>音频</span>,
                                },
                                {
                                    value: 'text',
                                    label: <span>文本</span>,
                                },
                            ]}
                        />
                    </FieldItem>
                    <FieldItem label='语音'>
                        <Select
                            onChange={setVoice}
                            value={voice}
                            options={[
                                {
                                    value: 'Puck',
                                    label: <span>Puck</span>,
                                },
                                {
                                    value: 'Charon',
                                    label: <span>Charon</span>,
                                },
                                {
                                    value: 'Kore',
                                    label: <span>Kore</span>,
                                },
                                {
                                    value: 'Fenrir',
                                    label: <span>Fenrir</span>,
                                },
                                {
                                    value: 'Aoede',
                                    label: <span>Aoede</span>,
                                },
                            ]}
                        />
                    </FieldItem>
                    <Collapse
                        bordered={false}
                        style={{ background: colorBgContainer }}
                        activeKey={toolsPaneActive}
                        onChange={(keys) =>
                            setToolsPaneActive(keys as string[])
                        }
                        items={[
                            {
                                key: 'tools',
                                label: '工具',
                                children: (
                                    <Flex
                                        vertical
                                        gap={8}
                                        style={{
                                            paddingInlineStart: 24,
                                        }}
                                    >
                                        <FieldItem label='代码执行'>
                                            <Checkbox
                                                onChange={(e) => {
                                                    if (tools) {
                                                        setTools({
                                                            ...tools,
                                                            codeExecution:
                                                                e.target
                                                                    .checked,
                                                        });
                                                    }
                                                }}
                                                checked={tools?.codeExecution}
                                            />
                                        </FieldItem>
                                        <FieldItem label='函数调用'>
                                            <Checkbox
                                                onChange={(e) => {
                                                    if (tools) {
                                                        setTools({
                                                            ...tools,
                                                            functionCalling:
                                                                e.target
                                                                    .checked,
                                                        });
                                                    }
                                                }}
                                                checked={tools?.functionCalling}
                                            />
                                        </FieldItem>
                                        <FieldItem label='自动函数响应'>
                                            <Checkbox
                                                onChange={(e) => {
                                                    if (tools) {
                                                        setTools({
                                                            ...tools,
                                                            automaticFunctionResponse:
                                                                e.target
                                                                    .checked,
                                                        });
                                                    }
                                                }}
                                                checked={
                                                    tools?.automaticFunctionResponse
                                                }
                                            />
                                        </FieldItem>
                                        <FieldItem label='基础'>
                                            <Checkbox
                                                onChange={(e) => {
                                                    if (tools) {
                                                        setTools({
                                                            ...tools,
                                                            grounding:
                                                                e.target
                                                                    .checked,
                                                        });
                                                    }
                                                }}
                                                checked={tools?.grounding}
                                            />
                                        </FieldItem>
                                    </Flex>
                                ),
                                style: panelStyle,
                            },
                        ]}
                    />
                </Flex>
            </Flex>
        </Layout>
    );
};

export default LivePage;
