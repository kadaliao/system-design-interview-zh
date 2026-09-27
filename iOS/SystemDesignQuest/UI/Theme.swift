import SwiftUI
import UIKit

/// 明快、圆润的配色与按钮样式，参考多邻国的视觉语言。
enum Palette {
    static let green = Color(hex: 0x58CC02)
    static let greenShadow = Color(hex: 0x58A700)
    static let blue = Color(hex: 0x1CB0F6)
    static let blueShadow = Color(hex: 0x1899D6)
    static let red = Color(hex: 0xFF4B4B)
    static let redShadow = Color(hex: 0xEA2B2B)
    static let gold = Color(hex: 0xFFC800)
    static let goldShadow = Color(hex: 0xE5A800)
    static let orange = Color(hex: 0xFF9600)
    static let purple = Color(hex: 0xCE82FF)
    static let purpleShadow = Color(hex: 0xA568CC)

    static let background = Color(light: 0xFFFFFF, dark: 0x131F24)
    static let surface = Color(light: 0xF7F7F7, dark: 0x1D2B31)
    static let card = Color(light: 0xFFFFFF, dark: 0x202F36)
    static let border = Color(light: 0xE5E5E5, dark: 0x37464F)
    static let borderShadow = Color(light: 0xD0D0D0, dark: 0x2A383F)
    static let text = Color(light: 0x3C3C3C, dark: 0xF1F7FB)
    static let secondaryText = Color(light: 0x777777, dark: 0x9EAFB8)
    static let locked = Color(light: 0xE5E5E5, dark: 0x37464F)
    static let lockedShadow = Color(light: 0xC8C8C8, dark: 0x27343A)
    static let lockedIcon = Color(light: 0xAFAFAF, dark: 0x5F7079)
    static let correctBackground = Color(light: 0xD7FFB8, dark: 0x1F3A1C)
    static let correctText = Color(light: 0x58A700, dark: 0x79D634)
    static let wrongBackground = Color(light: 0xFFDFE0, dark: 0x3F2226)
    static let wrongText = Color(light: 0xEA2B2B, dark: 0xFF6B6B)
    static let selectedBackground = Color(light: 0xDDF4FF, dark: 0x1B3A4B)

    /// 各分段的主题色（主色, 阴影色）。
    static let sectionColors: [(Color, Color)] = [
        (green, greenShadow),
        (blue, blueShadow),
        (purple, purpleShadow),
        (Color(hex: 0xFF9600), Color(hex: 0xE08600)),
        (Color(hex: 0xFF86D0), Color(hex: 0xE46FB8)),
        (Color(hex: 0x2EC4B6), Color(hex: 0x21A396)),
        (Color(hex: 0xFF4B4B), Color(hex: 0xD93A3A)),
    ]

    static func section(_ index: Int) -> (Color, Color) { sectionColors[index % sectionColors.count] }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }

    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }
}

extension Font {
    static func rounded(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

/// 带底部“厚度”的立体按钮，按下时下沉。
struct ChunkyButtonStyle: ButtonStyle {
    var fill: Color = Palette.green
    var shadow: Color = Palette.greenShadow
    var foreground: Color = .white
    var height: CGFloat = 50
    var depth: CGFloat = 4

    func makeBody(configuration: Configuration) -> some View {
        ChunkyBody(configuration: configuration, fill: fill, shadow: shadow, foreground: foreground, height: height, depth: depth)
    }

    private struct ChunkyBody: View {
        let configuration: Configuration
        let fill: Color, shadow: Color, foreground: Color
        let height: CGFloat, depth: CGFloat
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            let pressed = configuration.isPressed && isEnabled
            configuration.label
                .font(.rounded(17, .bold))
                .foregroundStyle(isEnabled ? foreground : Palette.lockedIcon)
                .frame(maxWidth: .infinity, minHeight: height)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(isEnabled ? fill : Palette.locked)
                )
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(isEnabled ? shadow : Palette.lockedShadow)
                        .offset(y: pressed ? 0 : depth)
                )
                .offset(y: pressed ? depth : 0)
                .padding(.bottom, depth)
                .animation(.easeOut(duration: 0.08), value: pressed)
        }
    }
}

/// 白底描边、带厚度的卡片按钮（选项、词块等）。
struct OutlineCardStyle: ButtonStyle {
    var state: State = .normal
    var cornerRadius: CGFloat = 14

    enum State { case normal, selected, correct, wrong, disabled }

    func makeBody(configuration: Configuration) -> some View {
        let (fill, stroke, text): (Color, Color, Color) = switch state {
        case .normal: (Palette.card, Palette.border, Palette.text)
        case .selected: (Palette.selectedBackground, Palette.blue, Palette.blueShadow)
        case .correct: (Palette.correctBackground, Palette.green, Palette.correctText)
        case .wrong: (Palette.wrongBackground, Palette.red, Palette.wrongText)
        case .disabled: (Palette.surface, Palette.border, Palette.lockedIcon)
        }
        let pressed = configuration.isPressed && state != .disabled
        return configuration.label
            .foregroundStyle(text)
            .background(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).strokeBorder(stroke, lineWidth: 2))
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(stroke.opacity(state == .normal ? 1 : 0.9))
                    .offset(y: pressed ? 0 : 3)
            )
            .offset(y: pressed ? 3 : 0)
            .padding(.bottom, 3)
            .animation(.easeOut(duration: 0.08), value: pressed)
    }
}

/// 触感反馈，受设置开关控制。
@MainActor
enum Haptics {
    static var enabled = true

    static func success() { notify(.success) }
    static func error() { notify(.error) }
    static func tap() {
        guard enabled else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private static func notify(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        guard enabled else { return }
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }
}
