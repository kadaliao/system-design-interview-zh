import SwiftUI

struct SettingsScreen: View {
    @Environment(ProgressStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var confirmReset = false
    @State private var notificationsDenied = false

    private static let repoURL = URL(string: "https://github.com/kadaliao/system-design-interview-zh")!

    var body: some View {
        Form {
            Section {
                Picker("每日目标", selection: binding(\.dailyGoal)) {
                    Text("轻松 10").tag(10)
                    Text("常规 20").tag(20)
                    Text("认真 30").tag(30)
                    Text("冲刺 50").tag(50)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } header: {
                Text("每日目标（XP）")
            } footer: {
                Text("一课约 10～15 XP。每天至少完成一次学习就能续上连胜；每连续 7 天奖励一次连胜保护。")
            }

            Section {
                Toggle("红心限制", isOn: binding(\.heartsEnabled))
                Toggle("自由模式", isOn: binding(\.freeMode))
                Toggle("触感反馈", isOn: binding(\.hapticsEnabled))
            } header: {
                Text("闯关")
            } footer: {
                Text("红心：闯关答错扣一颗，每 30 分钟恢复一颗。自由模式：不按顺序解锁，所有关卡都能直接进入，适合已经学过一部分的读者。")
            }

            Section {
                Toggle("每日提醒", isOn: Binding(
                    get: { store.settings.reminderEnabled },
                    set: { enabled in
                        if enabled {
                            Task {
                                let granted = await ReminderScheduler.requestAuthorization()
                                if granted {
                                    store.updateSettings { $0.reminderEnabled = true }
                                } else {
                                    notificationsDenied = true
                                }
                            }
                        } else {
                            store.updateSettings { $0.reminderEnabled = false }
                        }
                    }))
                if store.settings.reminderEnabled {
                    DatePicker("提醒时间", selection: reminderTime, displayedComponents: .hourAndMinute)
                }
            } header: {
                Text("提醒")
            } footer: {
                Text("当天已经学过就不再提醒。")
            }

            Section("课程") {
                Link(destination: store.library.course.readerURL) {
                    Label("在线阅读版", systemImage: "safari")
                }
                Link(destination: Self.repoURL) {
                    Label("GitHub 仓库", systemImage: "chevron.left.forwardslash.chevron.right")
                }
                LabeledContent("题目", value: "\(store.library.allExercises.count) 道闯关题 · \(store.library.course.cards.count) 张口述卡")
                LabeledContent("交互实验", value: "\(store.library.chapters.reduce(0) { $0 + $1.labs.count }) 个")
                LabeledContent("内容版本", value: store.library.course.version)
            }

            Section {
                Button("重置学习进度", role: .destructive) { confirmReset = true }
            } footer: {
                Text("题目依据《系统设计面试笔记：中文学习版》编写，该学习版整理自 liquidslr/system-design-notes 与 Alex Xu《System Design Interview》卷 1、卷 2。学习记录只保存在本机。")
            }
        }
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("清空全部课程进度、经验、连胜、错题和口述记录？此操作无法撤销。", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("重置", role: .destructive) { store.resetProgress() }
            Button("取消", role: .cancel) {}
        }
        .alert("没有通知权限", isPresented: $notificationsDenied) {
            Button("去设置") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("请在系统设置里允许「系统设计闯关」发送通知。")
        }
    }

    private func binding<T>(_ keyPath: WritableKeyPath<ProgressState.Settings, T>) -> Binding<T> {
        Binding(get: { store.settings[keyPath: keyPath] },
                set: { value in store.updateSettings { $0[keyPath: keyPath] = value } })
    }

    private var reminderTime: Binding<Date> {
        Binding(
            get: {
                store.calendar.date(bySettingHour: store.settings.reminderHour, minute: store.settings.reminderMinute,
                                    second: 0, of: store.now) ?? store.now
            },
            set: { date in
                let parts = store.calendar.dateComponents([.hour, .minute], from: date)
                store.updateSettings {
                    $0.reminderHour = parts.hour ?? 20
                    $0.reminderMinute = parts.minute ?? 0
                }
            })
    }
}
