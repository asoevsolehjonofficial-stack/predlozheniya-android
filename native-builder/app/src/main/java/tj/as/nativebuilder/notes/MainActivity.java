package tj.as.nativebuilder.notes;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;

public final class MainActivity extends Activity {
    private static final String PREFS = "as_native_notes";
    private static final String NOTES_KEY = "notes_json";

    private final ArrayList<String> notes = new ArrayList<>();
    private ArrayAdapter<String> adapter;
    private EditText input;
    private Button addButton;
    private ListView list;
    private int editingPosition = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        loadNotes();
        buildInterface();
        refreshList();
    }

    private void buildInterface() {
        int pad = dp(18);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(0xFFF7F8FC);

        TextView title = new TextView(this);
        title.setText("A.S. Notes");
        title.setTextColor(0xFF172033);
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setPadding(0, dp(4), 0, dp(10));
        root.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView subtitle = new TextView(this);
        subtitle.setText("Личные заметки хранятся на этом устройстве");
        subtitle.setTextColor(0xFF596579);
        subtitle.setTextSize(14);
        root.addView(subtitle, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        input = new EditText(this);
        input.setId(R.id.note_input);
        input.setHint("Напишите заметку…");
        input.setSingleLine(false);
        input.setMinLines(2);
        input.setMaxLines(4);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        inputParams.topMargin = dp(14);
        root.addView(input, inputParams);

        addButton = new Button(this);
        addButton.setId(R.id.note_add_button);
        addButton.setText("Добавить заметку");
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        buttonParams.topMargin = dp(6);
        root.addView(addButton, buttonParams);
        addButton.setOnClickListener(v -> saveInput());

        TextView help = new TextView(this);
        help.setText("Нажмите на заметку, чтобы изменить её. Удерживайте, чтобы удалить.");
        help.setTextColor(0xFF596579);
        help.setTextSize(12);
        help.setPadding(0, dp(10), 0, dp(4));
        root.addView(help);

        list = new ListView(this);
        list.setId(R.id.note_list);
        adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, notes) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                TextView view = (TextView) super.getView(position, convertView, parent);
                view.setTextColor(0xFF172033);
                view.setTextSize(16);
                view.setPadding(dp(12), dp(12), dp(12), dp(12));
                view.setMinHeight(dp(52));
                return view;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> showEditDialog(position));
        list.setOnItemLongClickListener((parent, view, position, id) -> {
            confirmDelete(position);
            return true;
        });
        root.addView(list, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);
    }

    private void saveInput() {
        String value = input.getText().toString().trim();
        if (value.isEmpty()) {
            input.setError("Введите текст заметки");
            return;
        }
        if (editingPosition >= 0 && editingPosition < notes.size()) {
            notes.set(editingPosition, value);
        } else {
            notes.add(0, value);
        }
        editingPosition = -1;
        input.setText("");
        addButton.setText("Добавить заметку");
        persistNotes();
        refreshList();
    }

    private void showEditDialog(int position) {
        if (position < 0 || position >= notes.size()) return;
        EditText editor = new EditText(this);
        editor.setText(notes.get(position));
        editor.setSelection(editor.length());
        editor.setMinLines(2);
        editor.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        int pad = dp(20);
        LinearLayout container = new LinearLayout(this);
        container.setPadding(pad, dp(8), pad, 0);
        container.addView(editor, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        new AlertDialog.Builder(this)
                .setTitle("Изменить заметку")
                .setView(container)
                .setNegativeButton("Отмена", (dialog, which) -> dialog.dismiss())
                .setPositiveButton("Сохранить", (dialog, which) -> {
                    String value = editor.getText().toString().trim();
                    if (!value.isEmpty()) {
                        notes.set(position, value);
                        persistNotes();
                        refreshList();
                    }
                })
                .show();
    }

    private void confirmDelete(int position) {
        if (position < 0 || position >= notes.size()) return;
        new AlertDialog.Builder(this)
                .setTitle("Удалить заметку?")
                .setMessage("Это действие нельзя отменить.")
                .setNegativeButton("Отмена", (dialog, which) -> dialog.dismiss())
                .setPositiveButton("Удалить", (dialog, which) -> {
                    notes.remove(position);
                    persistNotes();
                    refreshList();
                })
                .show();
    }

    private void loadNotes() {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(NOTES_KEY, "[]");
        try {
            JSONArray array = new JSONArray(saved);
            for (int i = 0; i < array.length(); i++) {
                String note = array.optString(i, "");
                if (!note.trim().isEmpty()) notes.add(note);
            }
        } catch (JSONException ignored) {
            notes.clear();
        }
    }

    private void persistNotes() {
        JSONArray array = new JSONArray();
        for (String note : notes) array.put(note);
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(NOTES_KEY, array.toString()).apply();
    }

    private void refreshList() {
        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
